// This small first-party controller runs before any optional tracking code.
(function () {
    const key = 'klem_privacy_v2', version = 2, lifetime = 30 * 86400000;
    const empty = () => ({ analytics: false, replay: false, advertising: false });
    function read() {
        try {
            const value = JSON.parse(window.localStorage.getItem(key));
            if (value?.version === version && value.expires > Date.now() &&
                value.decidedAt <= Date.now() && value.expires <= value.decidedAt + lifetime &&
                ['analytics', 'replay', 'advertising'].every(k => typeof value.choices?.[k] === 'boolean')) return value;
        } catch {}
        return null;
    }
    let record = read();
    function clearOptional() {
        const choices = record?.choices || empty();
        try {
            window.localStorage.removeItem('klem_replay_consent_v1');
            if (!choices.advertising) window.localStorage.removeItem('klem_openai_click');
            if (!choices.replay) {
                window.localStorage.removeItem('klem_replay_visitor');
                window.sessionStorage.removeItem('klem_replay_session');
            }
        } catch {}
        if (!choices.analytics) {
            window['ga-disable-G-4JVRVNQNTD'] = true;
            for (const part of (document.cookie || '').split(';')) {
                const name = part.trim().split('=')[0];
                if (!/^_ga(?:_|$)/.test(name)) continue;
                for (const domain of ['', '; domain=' + window.location.hostname, '; domain=.klem.co.il']) {
                    document.cookie = name + '=; Max-Age=0; path=/' + domain + '; SameSite=Lax';
                }
            }
        }
    }
    function apply(next) {
        const old = record?.choices || empty();
        record = next;
        clearOptional();
        document.dispatchEvent(new CustomEvent('klem:privacy-change', { detail: record }));
        // Unload Google's automatic listeners as well as disabling explicit events.
        if (old.analytics && !record?.choices.analytics) window.location.reload();
    }
    window.klemPrivacy = {
        current: () => record,
        allows: purpose => !!(record && record.expires > Date.now() && record.choices[purpose] === true),
        choose(choices) {
            const decidedAt = Date.now();
            const next = { version, decidedAt, expires: decidedAt + lifetime,
                choices: Object.fromEntries(Object.keys(empty()).map(k => [k, choices[k] === true])) };
            try { window.localStorage.setItem(key, JSON.stringify(next)); } catch {}
            apply(next);
        },
    };
    clearOptional();
    window.addEventListener('storage', event => { if (event.key === key || event.key === null) apply(read()); });
    window.addEventListener('pageshow', () => { if (record && record.expires <= Date.now()) apply(null); });
    setInterval(() => { if (record && record.expires <= Date.now()) apply(null); }, 30000);
})();
