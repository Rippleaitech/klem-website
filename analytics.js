// Keep local development and Netlify previews out of the production property.
(function () {
    if (!["klem.co.il", "www.klem.co.il"].includes(window.location.hostname)) return;

    const measurementId = "G-4JVRVNQNTD";
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", measurementId, {
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
    });

    const tag = document.createElement("script");
    tag.async = true;
    tag.src = "https://www.googletagmanager.com/gtag/js?id=" + measurementId;
    document.head.appendChild(tag);

    // Use the documented image-tag transport with an explicit event payload.
    // This does not load the SDK's automatic customer-information matching.
    const pixelId = "EkxNrokDFMseq7cup6XkKD";
    const attributionKey = "klem_openai_click";
    const attributionLifetime = 30 * 24 * 60 * 60 * 1000;
    let openaiClick = "";

    try {
        const query = new URLSearchParams(window.location.search);
        const incoming = query.get("oppref") || query.get("openai_click_id");
        if (incoming && incoming.length <= 2048) {
            openaiClick = incoming;
            window.localStorage.setItem(attributionKey, JSON.stringify({
                value: incoming,
                expiresAt: Date.now() + attributionLifetime,
            }));
        } else {
            const saved = JSON.parse(window.localStorage.getItem(attributionKey) || "null");
            if (saved && typeof saved.value === "string" && saved.value.length <= 2048 &&
                saved.expiresAt > Date.now()) {
                openaiClick = saved.value;
            } else {
                window.localStorage.removeItem(attributionKey);
            }
        }
    } catch (_) {
        // Storage restrictions must not stop the form or same-page attribution.
    }

    const sendGoogleEvent = (name, parameters) => {
        try {
            window.gtag("event", name, parameters);
        } catch (_) {
            // Measurement must never interrupt a visitor's contact action.
        }
    };

    document.addEventListener("klem:lead-submitted", () => {
        sendGoogleEvent("generate_lead", { form_name: "contact", method: "contact_form" });

        try {
            const eventId = window.crypto && window.crypto.randomUUID
                ? window.crypto.randomUUID()
                : "lead_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2);
            const params = new URLSearchParams({
                pid: pixelId,
                event: "lead_created",
                event_id: eventId,
                "data[type]": "customer_action",
            });
            if (openaiClick) params.set("oppref", openaiClick);

            // Render only after Netlify accepts the form, never on page load.
            // No names, phone numbers, email addresses or message text are sent.
            const beacon = document.createElement("img");
            beacon.width = 1;
            beacon.height = 1;
            beacon.alt = "";
            beacon.hidden = true;
            beacon.referrerPolicy = "origin";
            beacon.onload = beacon.onerror = () => beacon.remove();
            beacon.src = "https://bzr.openai.com/v1/sdk/events?" + params.toString();
            document.body.appendChild(beacon);
        } catch (_) {
            // A blocked tracking request must not turn a saved enquiry into an error.
        }
    });

    document.addEventListener("click", (event) => {
        const link = event.target && event.target.closest && event.target.closest("a[href]");
        if (!link) return;

        const url = new URL(link.href, window.location.href);
        let method;
        if (url.protocol === "tel:") method = "phone";
        else if (url.protocol === "mailto:") method = "email";
        else if (url.hostname === "wa.me" || url.hostname === "api.whatsapp.com") method = "whatsapp";
        if (!method) return;

        // These are contact attempts, not confirmed leads or campaign conversions.
        sendGoogleEvent(method + "_click", { contact_method: method });
    });
})();
