import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startServer } from '../test-support/server.js';
import { openPage, findChrome } from '../test-support/browser.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const srv = await startServer();
test.after(() => srv.stop());

test('package.json : champs utilisés par la barre latérale', () => {
  assert.match(pkg.version, /^\d+\.\d+\.\d+/, 'version semver');
  assert.match(pkg.repository?.url ?? '', /^git\+https:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git$/);
  assert.match(pkg.homepage ?? '', /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+#readme$/);
  assert.equal(pkg.license, 'AGPL-3.0-only');
  const licence = readFileSync(new URL('../LICENSE', import.meta.url), 'utf8');
  assert.match(licence, /GNU AFFERO GENERAL PUBLIC LICENSE\s+Version 3, 19 November 2007/, 'LICENSE contient le texte AGPL v3');
  assert.equal(/Apache License|MIT License/.test(licence), false, "plus de trace des anciennes licences");
  assert.match(readFileSync(new URL('../NOTICE', import.meta.url), 'utf8'), /^SuricateWeb\nCopyright 2026 /);
});

test('API : version et liens dérivés de package.json, réservés aux utilisateurs connectés', async () => {
  const s = (await srv.get('/api/settings')).json;
  assert.equal(s.app.version, pkg.version, 'la version affichée EST celle de package.json');
  assert.equal(s.app.repoUrl, pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, ''), 'sans « git+ » ni « .git »');
  assert.equal(s.app.docsUrl, pkg.docs.url, 'le site de documentation publié (package.json › docs.url)');
  assert.deepEqual(s.app.docsLangs, pkg.docs.languages);
  for (const u of [s.app.repoUrl, s.app.docsUrl]) assert.match(u, /^https:\/\//, 'jamais autre chose que http(s)');

  assert.equal((await srv.get('/api/auth')).text.includes(pkg.version), false, "la version n'est pas exposée avant la connexion");
  srv.logout();
  assert.equal((await srv.get('/api/settings')).status, 401);
  assert.equal(await srv.login(), 200);
});

test('interface : version à côté du nom, liens GitHub et documentation en pied de barre latérale', { skip: !findChrome() && 'Chrome/Chromium introuvable', timeout: 60000 }, async () => {
  const page = await openPage(`${srv.base}/`);
  try {
    await page.run(`fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'boss', password: 'motdepasse-test-1' }) }).then((r) => r.status)`);
    await page.navigate(`${srv.base}/`);
    await page.run(`new Promise((res, rej) => { const t0 = Date.now(); const i = setInterval(() => { if (document.querySelector('.sidebar .brand')) { clearInterval(i); res(true); } else if (Date.now() - t0 > 8000) { clearInterval(i); rej(new Error('barre latérale absente')); } }, 100); })`);

    const ui = await page.run(`(() => {
      const brand = document.querySelector('.sidebar .brand');
      const links = [...document.querySelectorAll('.side-actions a')].map((a) => ({ href: a.href, target: a.target, rel: a.rel, label: a.getAttribute('aria-label'), svg: !!a.querySelector('svg'), w: Math.round(a.getBoundingClientRect().width) }));
      const order = [...document.querySelectorAll('.side-actions > *')].map((e) => e.tagName.toLowerCase() + ':' + (e.getAttribute('aria-label') || '').split(' ')[0]);
      return { name: brand.querySelector('.brand-name').firstChild.textContent, ver: brand.querySelector('.ver')?.textContent, verTitle: brand.querySelector('.ver')?.title, sub: brand.querySelector('small').textContent, links, order };
    })()`);
    assert.equal(ui.name, 'SuricateWeb');
    assert.equal(ui.ver, `v${pkg.version}`);
    assert.equal(ui.verTitle, `Version ${pkg.version}`);
    assert.equal(ui.sub, 'Surveillance de sites');
    // Interface en français (langue par défaut) : la racine du site de documentation (le navigateur ajoute la barre finale).
    assert.deepEqual(ui.links.map((l) => l.href), [pkg.homepage.replace('#readme', ''), new URL(pkg.docs.url).href]);
    assert.ok(ui.links.every((l) => l.target === '_blank' && l.rel.split(' ').includes('noopener') && l.rel.split(' ').includes('noreferrer')), 'nouvel onglet, sans fuite de la page appelante');
    assert.ok(ui.links.every((l) => l.svg && l.w >= 28 && l.label.endsWith('(nouvel onglet)')), 'icônes visibles, libellé accessible');
    assert.deepEqual(ui.order, ['a:Dépôt', 'a:Documentation', 'button:Changer', 'button:Se'], 'liens puis thème puis déconnexion');
  } finally {
    page.close();
  }
});

test('documentation : adresse selon la langue de l\'interface (français à la racine, autres langues sous /<langue>/)', async () => {
  const { docsHref } = await import('../public/i18n.js');
  const site = { docsUrl: 'https://docs.exemple.test', docsLangs: ['fr', 'en'] };
  assert.equal(docsHref(site, 'fr'), 'https://docs.exemple.test');
  assert.equal(docsHref(site, 'en'), 'https://docs.exemple.test/en/');
  assert.equal(docsHref({ ...site, docsUrl: 'https://docs.exemple.test/' }, 'en'), 'https://docs.exemple.test/en/', 'pas de double barre');
  assert.equal(docsHref(site, 'de'), 'https://docs.exemple.test', 'une langue que le site ne propose pas : la racine');
  // README du dépôt ou site d'un fork : aucune langue déclarée, l'adresse est ouverte telle quelle (jamais « /en/ » inventé).
  assert.equal(docsHref({ docsUrl: 'https://github.com/x/y#readme', docsLangs: [] }, 'en'), 'https://github.com/x/y#readme');
  assert.equal(docsHref({ docsUrl: 'https://github.com/x/y#readme' }, 'en'), 'https://github.com/x/y#readme');
  assert.equal(docsHref({}, 'en'), null);
  assert.equal(docsHref(null, 'en'), null);
});

test('documentation : package.json déclare un site https et des langues sobres ; sans `docs`, le README du dépôt sert de repli', async () => {
  assert.match(pkg.docs.url, /^https:\/\/[a-z0-9.-]+$/, 'adresse du site, sans chemin ni barre finale');
  assert.deepEqual(pkg.docs.languages, ['fr', 'en']);
  const { createApp } = await import('../src/app.js');
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const infoOf = (extra) => {
    const root = mkdtempSync(join(tmpdir(), 'suricate-docs-'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0', repository: { url: 'git+https://github.com/a/b.git' }, ...extra }));
    return createApp({ auth: { authenticate: () => ({ user: { id: 1, name: 'u' }, account: { id: 1 } }), register: () => {} }, root });
  };
  const get = async (extra) => {
    const app = infoOf(extra);
    const base = `http://127.0.0.1:${await app.listen(0, '127.0.0.1')}`;
    try { return (await (await fetch(`${base}/api/settings`)).json()).app; } finally { await app.stop(); }
  };
  assert.deepEqual(await get({}), { version: '1.0.0', repoUrl: 'https://github.com/a/b', docsUrl: 'https://github.com/a/b#readme', docsLangs: [] }, 'sans docs ni homepage : le README du dépôt');
  assert.equal((await get({ homepage: 'https://exemple.test/doc' })).docsUrl, 'https://exemple.test/doc');
  const full = await get({ docs: { url: 'https://docs.exemple.test/', languages: ['fr', 'en', 'EN', 'english', 7] } });
  assert.deepEqual([full.docsUrl, full.docsLangs], ['https://docs.exemple.test', ['fr', 'en']], 'barre finale retirée, codes de langue filtrés');
  assert.equal((await get({ docs: { url: 'javascript:alert(1)', languages: ['en'] }, homepage: 'https://exemple.test' })).docsUrl, 'https://exemple.test', 'jamais autre chose que http(s)');
  assert.deepEqual((await get({ docs: { url: 'javascript:alert(1)', languages: ['en'] } })).docsLangs, [], 'pas de langue sans adresse valable');
});
