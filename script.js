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
