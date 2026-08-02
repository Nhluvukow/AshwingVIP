document.addEventListener("DOMContentLoaded", function () {
  // Always start from the top on page load/refresh
  if (window.location.hash) {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  window.scrollTo(0, 0);

  // Mobile menu toggle
  const menuBtn = document.getElementById("menuBtn");
  const mobileMenu = document.getElementById("mobileMenu");
  const menuIcon = document.getElementById("menuIcon");
  const closeIcon = document.getElementById("closeIcon");

  menuBtn.addEventListener("click", function () {
    const isOpen = mobileMenu.classList.toggle("open");
    menuIcon.style.display = isOpen ? "none" : "block";
    closeIcon.style.display = isOpen ? "block" : "none";
  });

  // Close mobile menu on link click
  mobileMenu.querySelectorAll("a").forEach(function (link) {
    link.addEventListener("click", function () {
      mobileMenu.classList.remove("open");
      menuIcon.style.display = "block";
      closeIcon.style.display = "none";
    });
  });

  // Booking form
  const bookingForm = document.getElementById("bookingForm");
  const toast = document.getElementById("toast");
  const toastMsg = toast.querySelector(".toast-msg") || toast;

  bookingForm.addEventListener("submit", async function (e) {
    e.preventDefault();

    const formData = new FormData(bookingForm);
    const data = Object.fromEntries(formData.entries());

    const phoneCode = (data.phoneCode || '263').replace(/\D/g, '');
    const rawPhone = (data.phone || '').replace(/\D/g, '');
    if (rawPhone) {
      data.phone = rawPhone.startsWith('0')
        ? '+' + phoneCode + rawPhone.slice(1)
        : (rawPhone.startsWith(phoneCode) ? '+' + rawPhone : '+' + phoneCode + rawPhone);
    }
    delete data.phoneCode;

    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await res.json();

      if (result.success) {
        if (typeof toastMsg.textContent !== "undefined") {
          toastMsg.textContent = "Booking request submitted! We will contact you shortly.";
        }
        toast.classList.add("show");
        bookingForm.reset();
        if (carGroupRow) carGroupRow.style.display = "none";
      } else {
        if (typeof toastMsg.textContent !== "undefined") {
          toastMsg.textContent = "Something went wrong. Please try again.";
        }
        toast.classList.add("show");
      }
    } catch {
      if (typeof toastMsg.textContent !== "undefined") {
        toastMsg.textContent = "Server unavailable. Please call +263 77 575 2700.";
      }
      toast.classList.add("show");
    }

    setTimeout(function () {
      toast.classList.remove("show");
    }, 4000);
  });

  // Toggle car group field when Car Rental is selected
  const serviceSelect = document.querySelector('select[name="service"]');
  const carGroupRow = document.getElementById("carGroupRow");

  if (serviceSelect && carGroupRow) {
    serviceSelect.addEventListener("change", function () {
      carGroupRow.style.display = this.value === "car-rental" ? "grid" : "none";
    });
  }

  // Scroll animations using Intersection Observer
  const animatedElements = document.querySelectorAll(".fade-in");

  if (animatedElements.length > 0) {
    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    animatedElements.forEach(function (el) {
      observer.observe(el);
    });
  }

  // Set current year in footer
  const yearEl = document.getElementById("currentYear");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }
});
