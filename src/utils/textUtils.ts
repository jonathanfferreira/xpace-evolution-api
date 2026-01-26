export function isGreeting(text: string): boolean {
    const greetings = ['oi', 'ola', 'olá', 'bom dia', 'boa tarde', 'boa noite', 'menu', 'iniciar', 'start', 'começar'];
    return greetings.some(greeting => text.toLowerCase().includes(greeting));
}

export function isLocationRequest(text: string): boolean {
    const keywords = ['localização', 'onde fica', 'endereço', 'localizacao', 'como chego', 'rua', 'mapa'];
    return keywords.some(keyword => text.toLowerCase().includes(keyword));
}

export function getSmartName(rawName: string | undefined): string | null {
    if (!rawName) return null;

    const cleanName = rawName.split(' ')[0].replace(/[^a-zA-ZÀ-ÿ]/g, ''); // Remove emojis/símbolos

    // Regras de validação
    if (cleanName.length < 2) return null; // Muito curto (Ex: "A", "Jo")
    if (cleanName.length > 15) return null; // Muito longo (provavelmente nick)
    if (/^[a-z]+$/.test(cleanName)) {
        // Se for tudo minúsculo, capitaliza a primeira letra
        return cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
    }
    return cleanName;
}
