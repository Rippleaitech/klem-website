// Keeps Tab inside an open overlay, so keyboard users cannot wander into the
// page behind it. Shared by the menu, the project dialog and the lightbox.
const FOCUSABLE = 'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])';

const trapFocus = (container, e) => {
    if (e.key !== "Tab") return;

    const items = [...container.querySelectorAll(FOCUSABLE)]
        .filter((el) => el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    if (!items.length) return;

    const first = items[0];
    const last = items[items.length - 1];

    if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
    }
};

const menuButton = document.getElementById("menuButton");
const navMenu = document.getElementById("navMenu");
const navMenuClose = document.getElementById("navMenuClose");

const MENU_TRANSITION = 250; // keep in sync with the .nav-menu transition

const openMenu = () => {
    navMenu.classList.add("active");
    document.body.style.overflow = "hidden";
    menuButton.setAttribute("aria-expanded", "true");
    // Move focus into the panel so the next Tab stays inside it
    if (navMenuClose) navMenuClose.focus();
};

const closeMenu = ({ restoreFocus = true } = {}) => {
    navMenu.classList.remove("active");
    document.body.style.overflow = "";
    menuButton.setAttribute("aria-expanded", "false");
    if (restoreFocus) menuButton.focus();
};

menuButton.addEventListener("click", openMenu);

if (navMenuClose) {
    navMenuClose.addEventListener("click", () => closeMenu());
}

document.addEventListener("keydown", (e) => {
    if (!navMenu.classList.contains("active")) return;

    if (e.key === "Escape") {
        closeMenu();
        return;
    }
    trapFocus(navMenu, e);
});

// Close the menu first, then scroll -- otherwise the scroll happens behind
// the full-screen panel and the body is still locked.
navMenu.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (e) => {
        const target = document.getElementById(link.getAttribute("href").slice(1));
        if (!target) return;

        e.preventDefault();
        // Focus follows the jump rather than returning to the hamburger, so a
        // keyboard or screen-reader user lands in the section they picked.
        closeMenu({ restoreFocus: false });
        setTimeout(() => {
            target.scrollIntoView({ behavior: "smooth", block: "start" });
            target.setAttribute("tabindex", "-1");
            target.focus({ preventScroll: true });
        }, MENU_TRANSITION + 10);
    });
});

const slidesTrack = document.getElementById("slidesTrack");
const slides = document.querySelectorAll(".slide");
const totalSlides = slides.length;

const SLIDE_DURATION = 800;
const AUTOPLAY_DELAY = 3500;

// The slider only exists on the home page.
if (slidesTrack && totalSlides > 0) {

    // A clone at each end makes the loop seamless in both directions. The track is
    // RTL, so DOM order runs right-to-left and the prepended clone sits to the
    // right of slide 0 -- hence the +1 offset applied to every position.
    slidesTrack.appendChild(slides[0].cloneNode(true));
    slidesTrack.insertBefore(slides[totalSlides - 1].cloneNode(true), slides[0]);

    let currentSlide = 0;
    let isSliding = false;

    const positionTrack = (index, animate) => {
        slidesTrack.style.transition = animate
            ? `transform ${SLIDE_DURATION}ms ease-in-out`
            : "none";
        slidesTrack.style.transform = `translateX(${(index + 1) * 100}%)`;
    };

    positionTrack(currentSlide, false);

    const goToSlide = (direction) => {
        if (isSliding) return;
        isSliding = true;

        const target = currentSlide + direction;
        positionTrack(target, true);

        setTimeout(() => {
            if (target === totalSlides) {
                // Landed on the trailing clone of slide 0 -- jump back silently
                currentSlide = 0;
                positionTrack(currentSlide, false);
            } else if (target === -1) {
                // Landed on the leading clone of the last slide
                currentSlide = totalSlides - 1;
                positionTrack(currentSlide, false);
            } else {
                currentSlide = target;
            }
            isSliding = false;
        }, SLIDE_DURATION);
    };

    // WCAG 2.2.2: the carousel moves on its own, so it needs a way to stop it.
    // A reduced-motion preference starts it paused.
    const prefersReducedMotion =
        window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let autoplay = null;
    let isPaused = prefersReducedMotion;

    const startAutoplay = () => {
        clearInterval(autoplay);
        autoplay = setInterval(() => goToSlide(1), AUTOPLAY_DELAY);
    };

    const stopAutoplay = () => {
        clearInterval(autoplay);
        autoplay = null;
    };

    if (!isPaused) startAutoplay();

    // Manual navigation restarts the timer, so the slide does not jump again
    // straight after the user has moved it themselves.
    const navigate = (direction) => {
        goToSlide(direction);
        if (!isPaused) startAutoplay();
    };

    document.getElementById("sliderNext").addEventListener("click", () => navigate(1));
    document.getElementById("sliderPrev").addEventListener("click", () => navigate(-1));

    const sliderPause = document.getElementById("sliderPause");

    const reflectPauseState = () => {
        sliderPause.setAttribute("aria-pressed", String(isPaused));
        sliderPause.setAttribute(
            "aria-label",
            isPaused
                ? "הפעלת ההחלפה האוטומטית של התמונות"
                : "עצירת ההחלפה האוטומטית של התמונות"
        );
    };

    if (sliderPause) {
        reflectPauseState();
        sliderPause.addEventListener("click", () => {
            isPaused = !isPaused;
            if (isPaused) stopAutoplay();
            else startAutoplay();
            reflectPauseState();
        });
    }

    // Swipe. In RTL the next slide sits to the left of the current one, so
    // dragging rightwards is what pulls it into view.
    const slideshow = document.querySelector(".slideshow");
    let swipeStartX = 0;
    let swipeStartY = 0;

    slideshow.addEventListener("touchstart", (e) => {
        swipeStartX = e.touches[0].clientX;
        swipeStartY = e.touches[0].clientY;
    }, { passive: true });

    slideshow.addEventListener("touchend", (e) => {
        const deltaX = e.changedTouches[0].clientX - swipeStartX;
        const deltaY = e.changedTouches[0].clientY - swipeStartY;

        // Ignore vertical scrolling and drags too small to be intentional
        if (Math.abs(deltaX) < 40 || Math.abs(deltaX) < Math.abs(deltaY)) return;

        navigate(deltaX > 0 ? 1 : -1);
    }, { passive: true });
}

// Project Data
const projectData = {
    "שכונת הדר החדשה בגבעת שמואל": {
        title: "שכונת הדר, גבעת שמואל",
        text: `<p>פרויקט מגורים רחב היקף בשכונת הדר המבוקשת בגבעת שמואל, הכולל מגדלי מגורים וסביבה משותפת מטופחת. המתחם משלב לובאים מעוצבים, שטחים ירוקים, גינות, שבילים ושטחים משותפים המשרתים את דיירי הפרויקט.</p><p>קלמנטינה אחראית על הניהול והתחזוקה השוטפת של המתחם, לרבות ניקיון, גינון, תחזוקת המערכות והשטחים המשותפים, תוך שמירה על סטנדרט גבוה וחוויית מגורים איכותית לאורך זמן.</p>`,
        cover: "images/cover_lipkin.jpeg",
        gallery: [
            "images/lipkin_1.jpeg",
            "images/lipkin_2.jpeg",
            "images/cover_ariel_sharon.jpeg"
        ]
    },
    "שכונת נאות אריאל שרון בקריית אונו": {
        title: "שכונת נאות אריאל שרון | קריית אונו",
        text: `<p>מתחם אריאל שרון, קריית אונו</p><p>קלמנטינה אחראית על הניהול והתחזוקה השוטפת של מתחם מגורים ומסחר רחב הכולל מספר מגדלים. השירות כולל ניהול מערכות הבניינים, ניקיון ותחזוקת השטחים המשותפים, טיפוח הסביבה והגינון ומתן מענה שוטף לדיירים — תוך שמירה על סטנדרט גבוה ואחיד בכל רחבי המתחם.</p>`,
        cover: "images/cover_ariel_sharon_1.jpeg",
        gallery: [
            "images/cover_ariel_sharon_2.jpeg",
            "images/Ariel_Sharon_2.jpeg",
            "images/Ariel_Sharon_3.jpeg"
        ]
    },
    "אלוני בורכוב, רמת גן": {
        title: "אלוני בורכוב, רמת גן",
        text: ``,
        cover: "images/Aloni_Borochov_Cover.jpeg",
        gallery: [
            "images/Aloni_Borochov_1.jpeg",
            "images/Aloni_Borochov_2.jpeg",
            "images/Aloni_Borochov_3.jpeg"
        ]
    }
};

// Managed Buildings Interactions
const managedItems = document.querySelectorAll(".managed-item");

managedItems.forEach(item => {
    const overlay = item.querySelector(".managed-overlay");
    const projectTitle = item.getAttribute("data-title");

    // Check if this project has detail data
    const hasProjectData = projectData[projectTitle];

    if (hasProjectData) {
        // Track touch position to distinguish tap from scroll
        let touchStartX = 0;
        let touchStartY = 0;
        let touchMoved = false;

        item.addEventListener("touchstart", (e) => {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            touchMoved = false;
        });

        item.addEventListener("touchmove", (e) => {
            const touchEndX = e.touches[0].clientX;
            const touchEndY = e.touches[0].clientY;
            const deltaX = Math.abs(touchEndX - touchStartX);
            const deltaY = Math.abs(touchEndY - touchStartY);

            // If finger moved more than 10px, consider it scrolling
            if (deltaX > 10 || deltaY > 10) {
                touchMoved = true;
            }
        });

        item.addEventListener("touchend", (e) => {
            // Only open project if touch didn't move (intentional tap)
            if (!touchMoved) {
                e.preventDefault();
                openProjectModal(projectTitle);
            }
        });

        // Desktop click behavior remains unchanged
        item.addEventListener("click", (e) => {
            // Only handle click if it's not from touch
            if (e.pointerType === "mouse" || !e.pointerType) {
                e.preventDefault();
                openProjectModal(projectTitle);
            }
        });

        // The card carries role="button", so it must answer Enter and Space
        // like a real button does.
        item.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
                e.preventDefault();
                openProjectModal(projectTitle);
            }
        });

        // Change cursor to pointer
        item.style.cursor = "pointer";
    } else {
        // For other projects, keep the original overlay behavior
        let tapTimeout = null;
        let lastTap = 0;

        item.addEventListener("touchstart", (e) => {
            const currentTime = new Date().getTime();
            const tapLength = currentTime - lastTap;

            if (tapLength < 300 && tapLength > 0) {
                e.preventDefault();
            } else {
                overlay.classList.toggle("active");
            }

            lastTap = currentTime;
        });
    }
});

// Statistics Counter Animation
const statNumbers = document.querySelectorAll(".stat-number");
let hasAnimated = false;

const animateCounter = (element) => {
    const target = parseInt(element.getAttribute("data-target"));
    const duration = 2000; // 2 seconds
    const increment = target / (duration / 16); // 60fps
    let current = 0;

    const updateCounter = () => {
        current += increment;
        if (current < target) {
            element.textContent = Math.floor(current).toLocaleString();
            requestAnimationFrame(updateCounter);
        } else {
            element.textContent = target.toLocaleString();
        }
    };

    updateCounter();
};

const observerOptions = {
    threshold: 0.5
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting && !hasAnimated) {
            hasAnimated = true;
            statNumbers.forEach(num => animateCounter(num));
        }
    });
}, observerOptions);

const statsSection = document.querySelector(".statistics-section");
if (statsSection) {
    observer.observe(statsSection);
}

// Contact Form Temporary Submit
const contactForm = document.querySelector(".contact-form");

if (contactForm) {
    const formStatus = document.getElementById("formStatus");

    // Error text is written next to the field it belongs to and linked with
    // aria-describedby, so a screen reader reads it with the field. The
    // summary goes into a live region instead of a native alert().
    const RULES = [
        { id: "name", message: "יש להזין שם מלא", test: (v) => v.trim().length > 1 },
        { id: "phone", message: "יש להזין מספר טלפון תקין", test: (v) => /^[\d\-+()\s]{9,}$/.test(v.trim()) },
        { id: "email", message: "יש להזין כתובת אימייל תקינה", test: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) },
        { id: "message", message: "יש להזין הודעה", test: (v) => v.trim().length > 0 },
    ];

    const setFieldError = (field, errorEl, message) => {
        if (message) {
            field.setAttribute("aria-invalid", "true");
            errorEl.textContent = message;
            errorEl.classList.add("visible");
        } else {
            field.removeAttribute("aria-invalid");
            errorEl.textContent = "";
            errorEl.classList.remove("visible");
        }
    };

    const submitButton = contactForm.querySelector(".contact-button");

    contactForm.addEventListener("submit", (e) => {
        e.preventDefault();

        const invalid = [];

        RULES.forEach(({ id, message, test }) => {
            const field = document.getElementById(id);
            const errorEl = document.getElementById(`${id}-error`);
            if (!field || !errorEl) return;

            const ok = test(field.value);
            setFieldError(field, errorEl, ok ? "" : message);
            if (!ok) invalid.push(field);
        });

        if (invalid.length) {
            formStatus.textContent = `הטופס לא נשלח. יש לתקן ${invalid.length} שדות ולנסות שוב.`;
            invalid[0].focus();
            return;
        }

        // Submit to Netlify Forms. The success message and the reset only
        // happen once Netlify has actually accepted the submission.
        if (submitButton) submitButton.disabled = true;
        formStatus.textContent = "שולח…";

        fetch("/", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams(new FormData(contactForm)).toString(),
        })
            .then((response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                formStatus.textContent = "הטופס נשלח בהצלחה. ניצור איתכם קשר בהקדם.";
                contactForm.reset();
            })
            .catch(() => {
                // Keep whatever the visitor typed so they can retry
                formStatus.textContent = "אירעה שגיאה בשליחת הטופס. אנא נסו שוב.";
            })
            .finally(() => {
                if (submitButton) submitButton.disabled = false;
            });
    });

    // Clear a field's error as soon as it becomes valid
    RULES.forEach(({ id, test }) => {
        const field = document.getElementById(id);
        const errorEl = document.getElementById(`${id}-error`);
        if (!field || !errorEl) return;

        field.addEventListener("input", () => {
            if (field.getAttribute("aria-invalid") === "true" && test(field.value)) {
                setFieldError(field, errorEl, "");
            }
        });
    });
}

// Project Modal Functions
let lastFocusedBeforeDialog = null;
let lastFocusedBeforeLightbox = null;

const restoreFocusAfterDialog = () => {
    if (lastFocusedBeforeDialog) {
        lastFocusedBeforeDialog.focus();
        lastFocusedBeforeDialog = null;
    }
};

const projectModal = document.getElementById("projectModal");
const projectModalOverlay = document.getElementById("projectModalOverlay");
const projectModalClose = document.getElementById("projectModalClose");
const projectModalTitle = document.getElementById("projectModalTitle");
const projectModalText = document.getElementById("projectModalText");
const projectModalCover = document.getElementById("projectModalCover");
const projectModalGallery = document.getElementById("projectModalGallery");

function openProjectModal(projectKey) {
    const project = projectData[projectKey];
    if (!project) return;

    // Set content
    projectModalTitle.textContent = project.title;
    projectModalText.innerHTML = project.text;

    // Set cover image
    projectModalCover.innerHTML = `<img src="${project.cover}" alt="${project.title}">`;

    // Set gallery images
    projectModalGallery.innerHTML = "";
    project.gallery.forEach((imgSrc, index) => {
        const img = document.createElement("img");
        img.src = imgSrc;
        img.alt = `${project.title} - תמונה ${index + 1}`;
        img.setAttribute("role", "button");
        img.setAttribute("tabindex", "0");
        img.setAttribute("aria-label", `${project.title} - הגדלת תמונה ${index + 1}`);
        img.addEventListener("click", () => openGalleryLightbox(imgSrc));
        img.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter" || ev.key === " " || ev.key === "Spacebar") {
                ev.preventDefault();
                openGalleryLightbox(imgSrc);
            }
        });
        projectModalGallery.appendChild(img);
    });

    // Show modal
    lastFocusedBeforeDialog = document.activeElement;
    projectModal.classList.add("active");
    document.body.style.overflow = "hidden";
    projectModal.focus();
}

function closeProjectModal() {
    projectModal.classList.remove("active");
    document.body.style.overflow = "";
    restoreFocusAfterDialog();
}

// Close modal on overlay click
if (projectModalOverlay) {
    projectModalOverlay.addEventListener("click", closeProjectModal);
}

// Close modal on close button click
if (projectModalClose) {
    projectModalClose.addEventListener("click", closeProjectModal);
}

// Close modal on Escape key
document.addEventListener("keydown", (e) => {
    if (!projectModal || !projectModal.classList.contains("active")) return;

    if (e.key === "Escape") {
        closeProjectModal();
        return;
    }
    trapFocus(projectModal, e);
});

// ===================== ACCESSIBILITY TOOLBAR =====================
// User-facing display adjustments, persisted across pages in localStorage.
// The same settings are re-applied by a small inline script in each page's
// <head>, so a saved preference is already in place before the first paint.

const A11Y_STORAGE_KEY = "klem-a11y";

// Text scaling uses `zoom` on the page regions rather than a root font-size,
// because the stylesheet sizes text in px and would not respond to one. The
// toolbar itself sits outside the zoomed regions so the controls never move.
const A11Y_TEXT_STEPS = [
    { className: "", label: "רגיל" },
    { className: "a11y-text-110", label: "גדול" },
    { className: "a11y-text-125", label: "גדול מאוד" },
];

// Each toggle maps to one class on <html>. Keep in sync with the inline
// <head> script and the ACCESSIBILITY TOOLBAR block in style.css.
const A11Y_TOGGLES = [
    { key: "contrast", className: "a11y-contrast", icon: "◐", label: "ניגודיות גבוהה" },
    { key: "links", className: "a11y-highlight-links", icon: "🔗", label: "הדגשת קישורים" },
    { key: "font", className: "a11y-readable-font", icon: "א", label: "גופן קריא" },
    { key: "motion", className: "a11y-no-motion", icon: "⏸", label: "עצירת אנימציות" },
];

const a11yDefaults = () => ({ text: 0, contrast: false, links: false, font: false, motion: false });

const readA11ySettings = () => {
    try {
        const saved = JSON.parse(localStorage.getItem(A11Y_STORAGE_KEY) || "{}");
        return { ...a11yDefaults(), ...saved };
    } catch {
        return a11yDefaults();
    }
};

const writeA11ySettings = (settings) => {
    try {
        localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(settings));
    } catch {
        // Private browsing or a full quota -- the settings still apply to this
        // page, they just will not survive navigation.
    }
};

let a11ySettings = readA11ySettings();

// Applies the settings to <html> and pauses the hero video when motion is off.
// The video autoplays and loops with no native control, so "stop animations"
// is what lets a user halt it (WCAG 2.0 SC 2.2.2).
const applyA11ySettings = () => {
    const root = document.documentElement;

    A11Y_TEXT_STEPS.forEach(({ className }) => {
        if (className) root.classList.remove(className);
    });
    const step = A11Y_TEXT_STEPS[a11ySettings.text];
    if (step && step.className) root.classList.add(step.className);

    A11Y_TOGGLES.forEach(({ key, className }) => {
        root.classList.toggle(className, Boolean(a11ySettings[key]));
    });

    document.querySelectorAll("video").forEach((video) => {
        if (a11ySettings.motion) {
            video.pause();
        } else if (video.paused) {
            video.play().catch(() => {
                // Autoplay can be refused by the browser; nothing to recover.
            });
        }
    });
};

const buildA11yToolbar = () => {
    const toolbar = document.createElement("div");
    toolbar.className = "accessibility-toolbar";

    const toggle = document.createElement("button");
    toggle.className = "accessibility-toggle";
    toggle.type = "button";
    toggle.id = "a11yToggle";
    toggle.setAttribute("aria-label", "פתיחת תפריט נגישות");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", "a11yMenu");
    toggle.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<circle cx="12" cy="4" r="2"/>' +
        '<path d="M4.5 8.5h15M12 7v7m0 0l-3.5 7M12 14l3.5 7"/>' +
        "</svg>";
    toolbar.appendChild(toggle);

    const menu = document.createElement("div");
    menu.className = "accessibility-menu";
    menu.id = "a11yMenu";
    menu.setAttribute("role", "dialog");
    menu.setAttribute("aria-label", "אפשרויות נגישות");

    const header = document.createElement("div");
    header.className = "accessibility-menu-header";

    const title = document.createElement("span");
    title.textContent = "אפשרויות נגישות";
    header.appendChild(title);

    const close = document.createElement("button");
    close.className = "accessibility-menu-close";
    close.type = "button";
    close.setAttribute("aria-label", "סגירת תפריט הנגישות");
    close.textContent = "✕";
    header.appendChild(close);

    menu.appendChild(header);

    // --- text size stepper ---
    const textRow = document.createElement("div");
    textRow.className = "accessibility-text-row";

    const decrease = document.createElement("button");
    decrease.className = "accessibility-text-button";
    decrease.type = "button";
    decrease.setAttribute("aria-label", "הקטנת גודל הטקסט");
    decrease.textContent = "‎−A";

    const readout = document.createElement("span");
    readout.className = "accessibility-text-readout";
    readout.setAttribute("aria-live", "polite");

    const increase = document.createElement("button");
    increase.className = "accessibility-text-button";
    increase.type = "button";
    increase.setAttribute("aria-label", "הגדלת גודל הטקסט");
    increase.textContent = "‎+A";

    textRow.append(decrease, readout, increase);
    menu.appendChild(textRow);

    // --- on/off options ---
    const optionButtons = A11Y_TOGGLES.map(({ key, icon, label }) => {
        const button = document.createElement("button");
        button.className = "accessibility-option";
        button.type = "button";
        button.dataset.a11yKey = key;

        const iconEl = document.createElement("span");
        iconEl.className = "accessibility-icon";
        iconEl.setAttribute("aria-hidden", "true");
        iconEl.textContent = icon;

        const labelEl = document.createElement("span");
        labelEl.textContent = label;

        button.append(iconEl, labelEl);
        menu.appendChild(button);
        return button;
    });

    // --- reset ---
    const reset = document.createElement("button");
    reset.className = "accessibility-option accessibility-reset";
    reset.type = "button";

    const resetIcon = document.createElement("span");
    resetIcon.className = "accessibility-icon";
    resetIcon.setAttribute("aria-hidden", "true");
    resetIcon.textContent = "↺";

    const resetLabel = document.createElement("span");
    resetLabel.textContent = "איפוס ההגדרות";

    reset.append(resetIcon, resetLabel);
    menu.appendChild(reset);

    const statementLink = document.createElement("a");
    statementLink.className = "accessibility-statement-link";
    statementLink.href = "accessibility.html";
    statementLink.textContent = "להצהרת הנגישות המלאה";
    menu.appendChild(statementLink);

    toolbar.appendChild(menu);
    document.body.appendChild(toolbar);

    // Reflects current settings onto the controls, so the panel always shows
    // the real state -- including settings restored from a previous visit.
    const syncControls = () => {
        readout.textContent = A11Y_TEXT_STEPS[a11ySettings.text].label;
        decrease.disabled = a11ySettings.text === 0;
        increase.disabled = a11ySettings.text === A11Y_TEXT_STEPS.length - 1;
        optionButtons.forEach((button) => {
            const on = Boolean(a11ySettings[button.dataset.a11yKey]);
            button.setAttribute("aria-pressed", on ? "true" : "false");
        });
    };

    const commit = () => {
        applyA11ySettings();
        writeA11ySettings(a11ySettings);
        syncControls();
    };

    const stepText = (delta) => {
        const next = a11ySettings.text + delta;
        if (next < 0 || next >= A11Y_TEXT_STEPS.length) return;
        a11ySettings.text = next;
        commit();
    };

    decrease.addEventListener("click", () => stepText(-1));
    increase.addEventListener("click", () => stepText(1));

    optionButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const key = button.dataset.a11yKey;
            a11ySettings[key] = !a11ySettings[key];
            commit();
        });
    });

    reset.addEventListener("click", () => {
        a11ySettings = a11yDefaults();
        commit();
    });

    const openToolbar = () => {
        toolbar.classList.add("active");
        toggle.setAttribute("aria-expanded", "true");
        close.focus();
    };

    const closeToolbar = ({ restoreFocus = true } = {}) => {
        toolbar.classList.remove("active");
        toggle.setAttribute("aria-expanded", "false");
        if (restoreFocus) toggle.focus();
    };

    toggle.addEventListener("click", () => {
        if (toolbar.classList.contains("active")) {
            closeToolbar();
        } else {
            openToolbar();
        }
    });

    close.addEventListener("click", () => closeToolbar());

    document.addEventListener("keydown", (e) => {
        if (!toolbar.classList.contains("active")) return;

        if (e.key === "Escape") {
            closeToolbar();
            return;
        }
        trapFocus(menu, e);
    });

    // A click anywhere else dismisses the panel, but must not steal focus back
    // to the trigger -- that would fight the user's next click.
    document.addEventListener("click", (e) => {
        if (!toolbar.classList.contains("active")) return;
        if (!toolbar.contains(e.target)) closeToolbar({ restoreFocus: false });
    });

    syncControls();
};

applyA11ySettings();
buildA11yToolbar();

// Gallery Lightbox Functions
const galleryLightbox = document.getElementById("galleryLightbox");
const galleryLightboxOverlay = document.getElementById("galleryLightboxOverlay");
const galleryLightboxClose = document.getElementById("galleryLightboxClose");
const galleryLightboxImage = document.getElementById("galleryLightboxImage");

function openGalleryLightbox(imageSrc) {
    lastFocusedBeforeLightbox = document.activeElement;
    galleryLightboxImage.src = imageSrc;
    galleryLightbox.classList.add("active");
    galleryLightbox.focus();
}

function closeGalleryLightbox() {
    galleryLightbox.classList.remove("active");
    galleryLightboxImage.src = "";
    if (lastFocusedBeforeLightbox) {
        lastFocusedBeforeLightbox.focus();
        lastFocusedBeforeLightbox = null;
    }
}

// Close lightbox on overlay click
if (galleryLightboxOverlay) {
    galleryLightboxOverlay.addEventListener("click", closeGalleryLightbox);
}

// Close lightbox on close button click
if (galleryLightboxClose) {
    galleryLightboxClose.addEventListener("click", closeGalleryLightbox);
}

// Close lightbox on Escape key
document.addEventListener("keydown", (e) => {
    if (!galleryLightbox || !galleryLightbox.classList.contains("active")) return;

    if (e.key === "Escape") {
        closeGalleryLightbox();
        return;
    }
    trapFocus(galleryLightbox, e);
});

