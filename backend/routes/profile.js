import { Router } from 'express';
import multer from 'multer';
import sql from '../lib/sql.js';
import { requireAuth } from '../middleware/auth.js';
import { parseLinkedInText } from '../services/linkedinParser.js';
import { pdfToText } from '../services/pdfText.js';
import { normalizeList, normalizeDomain } from '../services/normalize.js';
import { uploadCv, removeCv } from '../lib/cvStorage.js';

const router = Router();

const parseArr = (v) => (Array.isArray(v) ? v : (() => { try { const a = JSON.parse(v); return Array.isArray(a) ? a : []; } catch { return []; } })());

async function getProfile(userId) {
    const [p] = await sql`select * from "Profiles" where "UserId" = ${userId}`;
    return p;
}

const EMPTY_PROFILE = {
    Skills: [], Seniority: null, Modality: null, SalaryMin: null, SalaryMax: null,
    Headline: null, Phone: null, Whatsapp: null, Linkedin: null, Github: null, Portfolio: null,
    RequiredKeywords: [], BlockedWords: [], BlockedDomains: [], Levels: [], Modalities: [], Areas: [],
    StrictLevel: false, PostingDays: null, Region: 'br',
};

async function upsertProfile(userId, f) {
    await sql`
        insert into "Profiles" ("UserId", "Skills", "Seniority", "Modality", "SalaryMin", "SalaryMax", "Headline",
            "Phone", "Whatsapp", "Linkedin", "Github", "Portfolio",
            "RequiredKeywords", "BlockedWords", "BlockedDomains", "Levels", "Modalities", "Areas", "StrictLevel", "PostingDays", "Region", "UpdatedAt")
        values (${userId}, ${sql.json(f.Skills)}, ${f.Seniority}, ${f.Modality}, ${f.SalaryMin}, ${f.SalaryMax}, ${f.Headline},
            ${f.Phone}, ${f.Whatsapp}, ${f.Linkedin}, ${f.Github}, ${f.Portfolio},
            ${sql.json(f.RequiredKeywords)}, ${sql.json(f.BlockedWords)}, ${sql.json(f.BlockedDomains)},
            ${sql.json(f.Levels)}, ${sql.json(f.Modalities)}, ${sql.json(f.Areas || [])}, ${f.StrictLevel}, ${f.PostingDays}, ${f.Region || 'br'}, now())
        on conflict ("UserId") do update set
            "Skills" = excluded."Skills", "Seniority" = excluded."Seniority", "Modality" = excluded."Modality",
            "SalaryMin" = excluded."SalaryMin", "SalaryMax" = excluded."SalaryMax", "Headline" = excluded."Headline",
            "Phone" = excluded."Phone", "Whatsapp" = excluded."Whatsapp", "Linkedin" = excluded."Linkedin",
            "Github" = excluded."Github", "Portfolio" = excluded."Portfolio",
            "RequiredKeywords" = excluded."RequiredKeywords", "BlockedWords" = excluded."BlockedWords",
            "BlockedDomains" = excluded."BlockedDomains", "Levels" = excluded."Levels", "Modalities" = excluded."Modalities",
            "Areas" = excluded."Areas", "StrictLevel" = excluded."StrictLevel", "PostingDays" = excluded."PostingDays", "Region" = excluded."Region", "UpdatedAt" = now()`;
}

async function setCv(userId, cvPath, cvName) {
    await sql`update "Profiles" set "CvPath" = ${cvPath}, "CvName" = ${cvName}, "UpdatedAt" = now() where "UserId" = ${userId}`;
}

function publicProfile(p) {
    if (!p) return null;
    return {
        skills: parseArr(p.Skills),
        seniorities: parseArr(p.Levels),
        modalities: parseArr(p.Modalities),
        areas: parseArr(p.Areas),
        salaryMin: p.SalaryMin,
        salaryMax: p.SalaryMax,
        headline: p.Headline,
        phone: p.Phone,
        whatsapp: p.Whatsapp,
        linkedin: p.Linkedin,
        github: p.Github,
        portfolio: p.Portfolio,
        requiredKeywords: parseArr(p.RequiredKeywords),
        blockedWords: parseArr(p.BlockedWords),
        blockedDomains: parseArr(p.BlockedDomains),
        strictLevel: !!p.StrictLevel,
        postingDays: p.PostingDays,
        region: p.Region || 'br',
        cvName: p.CvName,
        hasCv: !!p.CvPath,
        updatedAt: p.UpdatedAt,
    };
}

// Upload em memória — o CV vai para o Supabase Storage (bucket "cvs").
const pdfFilter = (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Apenas arquivos PDF são aceitos'));
};
const uploadCvMem = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: pdfFilter });
const uploadMem = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: pdfFilter });

const toArr = (v) => (Array.isArray(v) ? v.map((s) => String(s).trim()).filter(Boolean) : []);

// GET /api/profile
router.get('/', requireAuth, async (req, res) => {
    res.json({ profile: publicProfile(await getProfile(req.user.Id)) });
});

// PUT /api/profile
router.put('/', requireAuth, async (req, res) => {
    const b = req.body || {};
    const ALLOWED_LEVELS = ['estagio', 'junior', 'pleno', 'senior', 'lead', 'manager'];
    const ALLOWED_MODALITIES = ['remoto', 'hibrido', 'presencial'];
    const ALLOWED_AREAS = ['dev', 'qa', 'po', 'data', 'design', 'devops', 'mobile'];
    const filterAllowed = (v, allowed) => toArr(v).map((x) => x.toLowerCase()).filter((x) => allowed.includes(x));

    await upsertProfile(req.user.Id, {
        ...EMPTY_PROFILE,
        Skills: normalizeList(b.skills),
        SalaryMin: Number.isFinite(+b.salaryMin) && b.salaryMin !== '' ? Math.round(+b.salaryMin) : null,
        SalaryMax: Number.isFinite(+b.salaryMax) && b.salaryMax !== '' ? Math.round(+b.salaryMax) : null,
        Headline: b.headline ? String(b.headline).replace(/[<>]/g, '').slice(0, 120) : null,
        Phone: b.phone ? String(b.phone).slice(0, 30) : null,
        Whatsapp: b.whatsapp ? String(b.whatsapp).slice(0, 30) : null,
        Linkedin: b.linkedin ? String(b.linkedin).slice(0, 200) : null,
        Github: b.github ? String(b.github).slice(0, 200) : null,
        Portfolio: b.portfolio ? String(b.portfolio).slice(0, 200) : null,
        RequiredKeywords: normalizeList(b.requiredKeywords),
        BlockedWords: normalizeList(b.blockedWords),
        BlockedDomains: normalizeList(b.blockedDomains, normalizeDomain),
        Levels: filterAllowed(b.seniorities, ALLOWED_LEVELS),
        Modalities: filterAllowed(b.modalities, ALLOWED_MODALITIES),
        Areas: filterAllowed(b.areas, ALLOWED_AREAS),
        StrictLevel: !!b.strictLevel,
        PostingDays: Number.isInteger(+b.postingDays) && +b.postingDays > 0 ? +b.postingDays : null,
        Region: b.region === 'intl' ? 'intl' : 'br',
    });

    res.json({ profile: publicProfile(await getProfile(req.user.Id)) });
});

// POST /api/profile/reset  — volta o perfil aos padrões (mantém o CV)
router.post('/reset', requireAuth, async (req, res) => {
    const current = await getProfile(req.user.Id);
    await upsertProfile(req.user.Id, { ...EMPTY_PROFILE });
    if (current?.CvPath) await setCv(req.user.Id, current.CvPath, current.CvName);
    res.json({ profile: publicProfile(await getProfile(req.user.Id)) });
});

// POST /api/profile/cv  (multipart/form-data, campo "cv")
router.post('/cv', requireAuth, (req, res) => {
    uploadCvMem.single('cv')(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        try {
            const current = await getProfile(req.user.Id);
            if (!current) await upsertProfile(req.user.Id, { ...EMPTY_PROFILE });
            const key = await uploadCv(req.user.Id, req.file);
            await setCv(req.user.Id, key, req.file.originalname);
            // remove o CV anterior do Storage (best-effort; ignora caminhos legados de disco)
            if (current?.CvPath && current.CvPath !== key) await removeCv(current.CvPath);
            res.json({ profile: publicProfile(await getProfile(req.user.Id)) });
        } catch (e) {
            console.error('Erro no upload do CV:', e.message);
            res.status(500).json({ error: 'Erro ao salvar o currículo' });
        }
    });
});

// POST /api/profile/import-linkedin  (multipart "pdf") — extrai e devolve SUGESTÕES
router.post('/import-linkedin', requireAuth, (req, res) => {
    uploadMem.single('pdf')(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        try {
            const text = await pdfToText(req.file.buffer);
            if (!text || text.trim().length < 30) {
                return res.status(422).json({ error: 'Não consegui ler o texto do PDF. Use o PDF exportado pelo próprio LinkedIn.' });
            }
            res.json({ extracted: parseLinkedInText(text) });
        } catch (e) {
            console.error('Erro ao importar LinkedIn:', e.message);
            res.status(422).json({ error: 'Falha ao processar o PDF. Verifique se é um PDF válido do LinkedIn.' });
        }
    });
});

export default router;
export { publicProfile };
