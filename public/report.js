// Scripts du rapport mensuel et de la page de statut (ces pages n'ont pas de script en ligne : voir la politique de sécurité du contenu).

// Thème : si l'utilisateur de l'application a choisi clair ou sombre, on le reprend (même origine, donc même stockage). Un visiteur sans
// choix enregistré — le client à qui on envoie le lien — suit la préférence de son système, comme le fait la feuille de style.
try {
  const t = localStorage.getItem('suricate-theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch { /* stockage indisponible : on garde la préférence du système */ }

// Bouton « Imprimer / PDF » du rapport.
document.addEventListener('click', (e) => {
  if (e.target.closest?.('[data-print]')) window.print();
});
