const menuButton = document.getElementById("menuButton");
const navMenu = document.getElementById("navMenu");

menuButton.addEventListener("click", () => {

    navMenu.classList.toggle("active");

    if (navMenu.classList.contains("active")) {
        menuButton.innerHTML = "✕";
    } else {
        menuButton.innerHTML = "☰";
    }

});

const slidesTrack = document.getElementById("slidesTrack");
const slides = document.querySelectorAll(".slide");

const firstSlideClone = slides[0].cloneNode(true);
slidesTrack.appendChild(firstSlideClone);

let currentSlide = 0;
const totalSlides = slides.length;

setInterval(() => {
    currentSlide++;

    slidesTrack.style.transition = "transform 0.8s ease-in-out";
    slidesTrack.style.transform = `translateX(${currentSlide * 100}%)`;

    if (currentSlide === totalSlides) {
        setTimeout(() => {
            slidesTrack.style.transition = "none";
            currentSlide = 0;
            slidesTrack.style.transform = "translateX(0)";
        }, 800);
    }

}, 3500);

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
        text: ``,
        cover: "images/cover_ariel_sharon_1.jpeg",
        gallery: [
            "images/cover_ariel_sharon_2.jpeg"
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
        // For projects with data (like Hadar), single click opens modal
        item.addEventListener("click", (e) => {
            e.preventDefault();
            openProjectModal(projectTitle);
        });

        item.addEventListener("touchstart", (e) => {
            e.preventDefault();
        });

        item.addEventListener("touchend", (e) => {
            e.preventDefault();
            openProjectModal(projectTitle);
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
projectModalOverlay.addEventListener("click", closeProjectModal);

// Close modal on close button click
projectModalClose.addEventListener("click", closeProjectModal);

// Close modal on Escape key
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && projectModal.classList.contains("active")) {
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
galleryLightboxOverlay.addEventListener("click", closeGalleryLightbox);

// Close lightbox on close button click
galleryLightboxClose.addEventListener("click", closeGalleryLightbox);

// Close lightbox on Escape key
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && galleryLightbox.classList.contains("active")) {
        closeGalleryLightbox();
    }
});
