/**
 * main.js — Interactions générales
 * Grande Mosquée de Bruxelles
 *
 * Contient :
 * - Menu hamburger (mobile)
 * - Lien de navigation actif au scroll
 */

'use strict';

document.addEventListener('DOMContentLoaded', () => {

  /* ----------------------------------------------------------------
     MENU HAMBURGER — mobile
  ---------------------------------------------------------------- */
  const navToggle = document.querySelector('.nav-toggle');
  const navMenu   = document.querySelector('.nav-menu');

  if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => {
      const isOpen = navMenu.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    /* Fermer le menu si on clique sur un lien */
    navMenu.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        navMenu.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ----------------------------------------------------------------
     LIEN ACTIF AU SCROLL
     Met la classe "active" sur le lien correspondant à la section visible
  ---------------------------------------------------------------- */
  const sections  = document.querySelectorAll('section[id]');
  const navLinks  = document.querySelectorAll('.nav-link');

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        navLinks.forEach(link => {
          link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
        });
      }
    });
  }, { rootMargin: '-40% 0px -55% 0px' });

  sections.forEach(section => observer.observe(section));

});
