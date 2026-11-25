// Fonctions du cœur qui s'activent explicitement. Un module SANS import : db.js, le planificateur et les contrôles le lisent sans cycle.
//
//   cms : connecteur WordPress / PrestaShop (plugins, relevés, widget, onglets Mises à jour / Sécurité / Santé / Activité).
//         Désactivé par défaut. La version hébergée l'active (createApp({ cms: true })) ; une installation auto-hébergée peut l'activer
//         avec SURICATE_CMS=1. Désactivé, la configuration CMS déjà enregistrée n'est PAS effacée : elle est simplement ignorée.
export const features = { cms: false };
