const menuButton = document.getElementById("menuButton");
const navMenu = document.getElementById("navMenu");
const navMenuClose = document.getElementById("navMenuClose");

const MENU_TRANSITION = 250; // keep in sync with the .nav-menu transition

const openMenu = () => {
    navMenu.classList.add("active");
    document.body.style.overflow = "hidden";
};

const closeMenu = () => {
    navMenu.classList.remove("active");
    document.body.style.overflow = "";
};

menuButton.addEventListener("click", openMenu);

if (navMenuClose) {
    navMenuClose.addEventListener("click", closeMenu);
}

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && navMenu.classList.contains("active")) {
        closeMenu();
    }
});

// Close the menu first, then scroll -- otherwise the scroll happens behind
// the full-screen panel and the body is still locked.
navMenu.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (e) => {
        const target = document.getElementById(link.getAttribute("href").slice(1));
        if (!target) return;

        e.preventDefault();
        closeMenu();
        setTimeout(() => {
            target.scrollIntoView({ behavior: "smooth", block: "start" });
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

    let autoplay = setInterval(() => goToSlide(1), AUTOPLAY_DELAY);

    // Manual navigation restarts the timer, so the slide does not jump again
    // straight after the user has moved it themselves.
    const navigate = (direction) => {
        goToSlide(direction);
        clearInterval(autoplay);
        autoplay = setInterval(() => goToSlide(1), AUTOPLAY_DELAY);
    };

    document.getElementById("sliderNext").addEventListener("click", () => navigate(1));
    document.getElementById("sliderPrev").addEventListener("click", () => navigate(-1));

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
    contactForm.addEventListener("submit", (e) => {
        e.preventDefault();
        alert("הטופס נשלח בהצלחה");
        contactForm.reset();
    });
}

// Project Modal Functions
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
        img.addEventListener("click", () => openGalleryLightbox(imgSrc));
        projectModalGallery.appendChild(img);
    });

    // Show modal
    projectModal.classList.add("active");
    document.body.style.overflow = "hidden";
}

function closeProjectModal() {
    projectModal.classList.remove("active");
    document.body.style.overflow = "";
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
    if (e.key === "Escape" && projectModal && projectModal.classList.contains("active")) {
        closeProjectModal();
    }
});

// Gallery Lightbox Functions
const galleryLightbox = document.getElementById("galleryLightbox");
const galleryLightboxOverlay = document.getElementById("galleryLightboxOverlay");
const galleryLightboxClose = document.getElementById("galleryLightboxClose");
const galleryLightboxImage = document.getElementById("galleryLightboxImage");

function openGalleryLightbox(imageSrc) {
    galleryLightboxImage.src = imageSrc;
    galleryLightbox.classList.add("active");
}

function closeGalleryLightbox() {
    galleryLightbox.classList.remove("active");
    galleryLightboxImage.src = "";
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
    if (e.key === "Escape" && galleryLightbox && galleryLightbox.classList.contains("active")) {
        closeGalleryLightbox();
    }
});
