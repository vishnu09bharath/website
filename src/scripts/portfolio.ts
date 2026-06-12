import { captureEvent, initAnalytics } from "./posthog";

initAnalytics();

const navLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>("[data-track-nav]"));
const outboundLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>("[data-track-link]"));

navLinks.forEach(link => {
  link.addEventListener("click", () => {
    captureEvent("portfolio_nav_clicked", {
      label: link.textContent?.replace("->", "").trim(),
      target: link.hash
    });
  });
});

outboundLinks.forEach(link => {
  link.addEventListener("click", () => {
    captureEvent("portfolio_link_clicked", {
      label: link.textContent?.trim(),
      href: link.href
    });
  });
});

const observer = new IntersectionObserver(
  entries => {
    const active = entries.find(entry => entry.isIntersecting);
    if (!active) {
      return;
    }

    captureEvent("portfolio_section_viewed", {
      section: active.target.id
    });
  },
  { rootMargin: "-30% 0px -45% 0px", threshold: 0.4 }
);

document.querySelectorAll("section[id]").forEach(section => observer.observe(section));
