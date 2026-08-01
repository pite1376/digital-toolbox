(() => {
  const menus = Array.from(document.querySelectorAll('.nav-menu'));
  const closeMenus = (except) => {
    menus.forEach((menu) => {
      if (menu === except) return;
      menu.classList.remove('open');
      menu.querySelector('.nav-trigger').setAttribute('aria-expanded', 'false');
    });
  };

  menus.forEach((menu) => {
    const trigger = menu.querySelector('.nav-trigger');
    trigger.addEventListener('click', () => {
      const opening = !menu.classList.contains('open');
      closeMenus(menu);
      menu.classList.toggle('open', opening);
      trigger.setAttribute('aria-expanded', String(opening));
      if (!opening) trigger.blur();
    });
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.nav-menu')) closeMenus();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMenus();
      document.querySelector('.nav-trigger:focus')?.blur();
    }
  });

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

  document.querySelectorAll('[data-top-target]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const project = document.getElementById(link.dataset.topTarget);
      if (!project) return;
      event.preventDefault();
      project.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
      history.replaceState(null, '', `#${project.id}`);
      setActive(project.id);
      closeMenus();
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
