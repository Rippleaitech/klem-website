// ==========================================
// KLEMANTINA - INTERACTIVE FUNCTIONALITY
// ==========================================

// Mobile Menu Toggle
const mobileMenuToggle = document.getElementById('mobileMenuToggle');
const navMenu = document.getElementById('navMenu');
const header = document.getElementById('mainHeader');

if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener('click', () => {
        navMenu.classList.toggle('active');
        mobileMenuToggle.classList.toggle('active');
        document.body.style.overflow = navMenu.classList.contains('active') ? 'hidden' : '';
    });
}

// Close mobile menu when clicking on a link
const navLinks = document.querySelectorAll('.nav-menu a');
navLinks.forEach(link => {
    link.addEventListener('click', () => {
        navMenu.classList.remove('active');
        mobileMenuToggle.classList.remove('active');
        document.body.style.overflow = '';
    });
});

// Header scroll effect
let lastScroll = 0;

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;

    if (currentScroll > 100) {
        header.classList.add('scrolled');
    } else {
        header.classList.remove('scrolled');
    }

    lastScroll = currentScroll;
});

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');

        // Don't prevent default for empty hash
        if (href === '#' || href === '') return;

        e.preventDefault();
        const target = document.querySelector(href);

        if (target) {
            const headerHeight = 80;
            const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - headerHeight;

            window.scrollTo({
                top: targetPosition,
                behavior: 'smooth'
            });
        }
    });
});

// Numbers Counter Animation
const numberItems = document.querySelectorAll('.number-item');
let numbersAnimated = false;

const animateNumber = (element) => {
    const valueElement = element.querySelector('.number-value');
    const targetValue = valueElement.getAttribute('data-target');

    // Skip animation if not a number
    if (!targetValue || isNaN(targetValue) || targetValue === '0') {
        return;
    }

    const target = parseInt(targetValue);
    const duration = 2000;
    const increment = target / (duration / 16);
    let current = 0;

    const updateNumber = () => {
        current += increment;
        if (current < target) {
            valueElement.textContent = Math.floor(current).toLocaleString('he-IL');
            requestAnimationFrame(updateNumber);
        } else {
            valueElement.textContent = target.toLocaleString('he-IL');
        }
    };

    updateNumber();
};

// Intersection Observer for numbers section
const numbersSection = document.querySelector('.numbers');
if (numbersSection) {
    const numbersObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !numbersAnimated) {
                numbersAnimated = true;
                numberItems.forEach(item => animateNumber(item));
            }
        });
    }, { threshold: 0.3 });

    numbersObserver.observe(numbersSection);
}

// Fade-in animation on scroll
const fadeElements = document.querySelectorAll('.fade-in');
const slideElements = document.querySelectorAll('.slide-up');

const scrollObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, { threshold: 0.1 });

fadeElements.forEach(el => scrollObserver.observe(el));
slideElements.forEach(el => scrollObserver.observe(el));

// Contact Form Handler
const contactForm = document.querySelector('.contact-form');
if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
        e.preventDefault();

        // Get form data
        const formData = new FormData(contactForm);
        const data = Object.fromEntries(formData);

        // Here you would send the data to your server
        console.log('Form submitted:', data);

        // Show success message
        alert('תודה! פנייתך נשלחה בהצלחה. ניצור איתך קשר בקרוב.');

        // Reset form
        contactForm.reset();
    });
}

// Project cards hover effect (subtle scale on image)
const projectCards = document.querySelectorAll('.project-card');
projectCards.forEach(card => {
    const imageContainer = card.querySelector('.project-image-placeholder');

    card.addEventListener('mouseenter', () => {
        imageContainer.style.transform = 'scale(1.05)';
        imageContainer.style.transition = 'transform 0.6s ease';
    });

    card.addEventListener('mouseleave', () => {
        imageContainer.style.transform = 'scale(1)';
    });
});

// Service cards hover effect
const serviceCards = document.querySelectorAll('.service-card');
serviceCards.forEach(card => {
    const imageContainer = card.querySelector('.service-image-placeholder');

    card.addEventListener('mouseenter', () => {
        imageContainer.style.transform = 'scale(1.05)';
        imageContainer.style.transition = 'transform 0.6s ease';
    });

    card.addEventListener('mouseleave', () => {
        imageContainer.style.transform = 'scale(1)';
    });
});

// Gallery items hover effect
const galleryItems = document.querySelectorAll('.gallery-item');
galleryItems.forEach(item => {
    const placeholder = item.querySelector('.gallery-placeholder');

    item.addEventListener('mouseenter', () => {
        placeholder.style.transform = 'scale(1.05)';
        placeholder.style.transition = 'transform 0.6s ease';
    });

    item.addEventListener('mouseleave', () => {
        placeholder.style.transform = 'scale(1)';
    });
});

// Prevent scroll when mobile menu is open
if (mobileMenuToggle) {
    const checkMenuState = () => {
        if (navMenu.classList.contains('active')) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
    };

    // Check on resize
    window.addEventListener('resize', () => {
        if (window.innerWidth > 1024) {
            navMenu.classList.remove('active');
            mobileMenuToggle.classList.remove('active');
            document.body.style.overflow = '';
        }
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Add smooth reveal to hero content
    const heroContent = document.querySelector('.hero-content');
    if (heroContent) {
        setTimeout(() => {
            heroContent.style.opacity = '1';
            heroContent.style.transform = 'translateY(0)';
        }, 300);
    }
});
