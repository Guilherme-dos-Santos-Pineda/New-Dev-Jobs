import { Component } from 'react';

// =========================
// Rede de proteção contra a TELA PRETA
// =========================
// Sem isto, qualquer erro durante o render derruba a árvore inteira: o React 18
// desmonta tudo e o que sobra é uma página em branco, sem uma palavra na tela.
// Foi o que aconteceu depois de um deploy, numa aba que estava aberta desde antes
// dele e pediu um chunk que já não existia.
//
// Tela preta é o pior defeito possível para quem usa: não diz o que houve, não
// sugere o que fazer, e é indistinguível de "o servidor caiu". Aqui ela vira uma
// mensagem com um botão que resolve o caso mais comum.
//
// Classe, e não hook: `componentDidCatch` só existe em componente de classe. Não
// há equivalente em função até hoje.
export default class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { erro: null };
    }

    static getDerivedStateFromError(erro) {
        return { erro };
    }

    componentDidCatch(erro, info) {
        // Vai para o console e para o errorLog, de onde o relato de bug o anexa.
        console.error('Erro não tratado no render:', erro, info?.componentStack);
    }

    recarregar = () => {
        // Recarrega buscando tudo de novo do servidor. O caso mais comum aqui é
        // chunk velho em aba antiga, e é exatamente isso que uma recarga resolve.
        try { sessionStorage.removeItem('chunkReloadAttempted'); } catch { /* modo privado */ }
        window.location.reload();
    };

    render() {
        if (!this.state.erro) return this.props.children;

        // Sem depender de CSS da aplicação: se o erro foi no carregamento do
        // bundle, a folha de estilo pode nem ter chegado.
        const caixa = {
            minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#0A0E14', color: '#F0F6FC', fontFamily: 'system-ui, sans-serif', padding: 24,
        };
        const botao = {
            background: '#185FA5', color: '#fff', border: 0, borderRadius: 10,
            padding: '11px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        };
        return (
            <div style={caixa}>
                <div style={{ maxWidth: 420, textAlign: 'center' }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
                    <h1 style={{ fontSize: 19, marginBottom: 10 }}>Algo quebrou ao carregar a página</h1>
                    <p style={{ fontSize: 14, lineHeight: 1.6, color: '#9DA7B3', marginBottom: 20 }}>
                        Na maioria das vezes isso acontece quando a aba estava aberta durante uma
                        atualização do site. Recarregar costuma resolver.
                    </p>
                    <button style={botao} onClick={this.recarregar}>Recarregar a página</button>
                    <p style={{ fontSize: 12, color: '#8B9CB0', marginTop: 18 }}>
                        Se continuar, fale com a gente no grupo do WhatsApp.
                    </p>
                </div>
            </div>
        );
    }
}
