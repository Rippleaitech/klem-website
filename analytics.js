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
})();
