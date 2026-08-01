(() => {
  const links = Array.from(document.querySelectorAll('[data-project-link]'));
  const projects = Array.from(document.querySelectorAll('[data-project]'));
  if (!links.length || !projects.length) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const setActive = (id) => {
    links.forEach((link) => {
      const active = link.dataset.projectLink === id;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  };

  links.forEach((link) => {
    link.addEventListener('click', (event) => {
      const project = document.getElementById(link.dataset.projectLink);
      if (!project) return;
      event.preventDefault();
      project.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
      history.replaceState(null, '', `#${project.id}`);
      setActive(project.id);
    });
  });

  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visible) setActive(visible.target.id);
  }, { rootMargin: '-18% 0px -48% 0px', threshold: [0, .2, .5] });

  projects.forEach((project) => observer.observe(project));
  const initial = location.hash.slice(1);
  setActive(projects.some((project) => project.id === initial) ? initial : projects[0].id);
})();
