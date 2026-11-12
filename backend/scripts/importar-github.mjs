import 'dotenv/config';
import sql from '../lib/sql.js';
import { runVagasGithub } from '../services/vagasGithub.js';
// Lê os repositórios de vagas do GitHub agora (o worker faz isso sozinho a cada 6 h).
// Uso: node backend/scripts/importar-github.mjs [dias]   (padrão 30, para a primeira carga)
const dias = Number(process.argv[2]) || 30;
const s = await runVagasGithub({ dias });
console.log(s);
const novas = await sql`
    select j."Id", j."JobTitle", j."Company", j."Area", j."Level", j."IsBR", j."Email"
    from "Jobs" j where j."LinkedinId" like 'github:%' order by j."Id" desc limit 20`;
console.table(novas.map((j) => ({ ...j, Email: j.Email ? j.Email.replace(/^[^@]+/, '***') : '' })));
await sql.end();
