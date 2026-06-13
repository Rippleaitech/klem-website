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

// Managed Buildings Interactions
const managedItems = document.querySelectorAll(".managed-item");

managedItems.forEach(item => {
    const overlay = item.querySelector(".managed-overlay");
    let tapTimeout = null;
    let lastTap = 0;

    // Touch events for mobile/tablet
    item.addEventListener("touchstart", (e) => {
        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTap;

        // Double tap detection (future use for links)
        if (tapLength < 300 && tapLength > 0) {
            // Double tap - will add link functionality later
            e.preventDefault();
        } else {
            // Single tap - show overlay
            overlay.classList.toggle("active");
        }

        lastTap = currentTime;
    });

    // Desktop hover is handled by CSS
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