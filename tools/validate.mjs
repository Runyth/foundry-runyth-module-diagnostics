// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { MODULE_BUILD, ROOT, fileExists, listFiles } from "./lib/fs.mjs";

const errors = [];
const warnings = [];
const assert = (condition, message) => {
  if (!condition) errors.push(message);
};

assert(await fileExists(path.join(MODULE_BUILD, "module.json")), "Build is missing module.json. Run npm run build first.");
if (errors.length === 0) {
  const manifest = JSON.parse(await readFile(path.join(MODULE_BUILD, "module.json"), "utf8"));
  assert(manifest.id === "runyth-module-diagnostics", "Unexpected module id.");
  assert(manifest.authors?.[0]?.name === "Runyth" && manifest.authors?.[0]?.url === "https://github.com/Runyth", "Public author must be Runyth.");
  assert(manifest.url === "https://github.com/Runyth/foundry-runyth-module-diagnostics", "Manifest url must use the public foundry- repository.");
  assert(manifest.download === `https://github.com/Runyth/foundry-runyth-module-diagnostics/releases/download/v${manifest.version}/runyth-module-diagnostics-v${manifest.version}-mod.zip`, "Manifest download must name the -mod archive.");
  assert(/^\d+\.\d+\.\d+$/u.test(manifest.version), "Version must use semantic x.y.z form.");
  const packageJson = JSON.parse(await readFile(path.join(path.dirname(MODULE_BUILD), "../package.json"), "utf8"));
  assert(packageJson.version === manifest.version, "package.json and module.json versions must match.");
  assert(Number.parseInt(manifest.compatibility?.minimum, 10) >= 13, "Minimum Foundry version must be 13 or newer.");
  assert(Boolean(manifest.compatibility?.verified), "Verified Foundry version is required.");
  assert(Boolean(manifest.compatibility?.maximum), "Maximum Foundry version is required.");

  const references = [
    ...(manifest.esmodules ?? []),
    ...(manifest.scripts ?? []),
    ...(manifest.styles ?? []),
    ...(manifest.languages ?? []).map((language) => language.path),
    manifest.license,
    manifest.readme
  ].filter(Boolean);
  for (const reference of references) {
    assert(await fileExists(path.join(MODULE_BUILD, reference)), `Manifest reference does not exist: ${reference}`);
  }

  const files = await listFiles(MODULE_BUILD);
  const sourceFiles = await listFiles(ROOT);
  const backupArtifacts = sourceFiles.filter((file) => /(?:^|\/)(?:[^/]+\.before-[^/]+|[^/]+\.(?:bak|orig)|[^/]+~)(?:\/|$)/u.test(file));
  assert(backupArtifacts.length === 0, `Source tree contains backup artifacts: ${backupArtifacts.join(", ")}`);
  const javascriptFiles = files.filter((file) => file.endsWith(".js"));
  for (const file of javascriptFiles) {
    const absolute = path.join(MODULE_BUILD, file);
    const source = await readFile(absolute, "utf8");
    for (const match of source.matchAll(/from\s+["'](\.\.?\/[^"']+)["']/gu)) {
      const resolved = path.resolve(path.dirname(absolute), match[1]);
      assert(await fileExists(resolved), `Unresolved ESM import in ${file}: ${match[1]}`);
    }
  }

  const css = await readFile(path.join(MODULE_BUILD, "styles/runyth-module-diagnostics.css"), "utf8");
  assert(!/min-width:\s*720px/gu.test(css), "Dashboard must not enforce the legacy 720 px minimum width.");
  assert(/\.rmd-scan-progress-shell\s*\{[^}]*min-height:\s*4\.8rem/su.test(css), "Scan progress must reserve stable vertical space to prevent layout shift.");
  assert(/\.rmd-scan-progress-shell progress\s*\{[^}]*width:\s*100%/su.test(css), "Scan progress bar must fill its reserved UI region.");
  assert(/\.rmd-user-list\s*\{[^}]*(?:overflow|overflow-y):\s*auto/su.test(css), "Player selector must remain scrollable for large user lists.");
  assert(/\.rmd-user-row\s*\{[^}]*grid-template-columns:/su.test(css), "Player rows require a stable aligned layout.");
  assert(/\.rmd-report-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(280px,\s*340px\)/su.test(css), "Report layout must keep the form flexible and the sidebar bounded.");
  assert(/input:not\(\[type="checkbox"\]\)[^{]*\{[^}]*padding:/su.test(css), "Text controls require explicit application-scoped padding.");
  assert(/button\s*\{[^}]*white-space:\s*normal/su.test(css), "Buttons must allow labels to wrap instead of overflowing.");
  const selectorBlocks = css.split("}").map((block) => block.split("{")[0]?.trim()).filter(Boolean);
  for (const selector of selectorBlocks) {
    if (selector.startsWith("@") || selector.includes("from") || selector.includes("to")) continue;
    for (const part of selector.split(",")) {
      const trimmed = part.trim();
      if (!trimmed || trimmed.startsWith("@")) continue;
      assert(trimmed.startsWith(".runyth-module-diagnostics-app"), `CSS selector is not application-scoped: ${trimmed}`);
    }
  }

  const template = await readFile(path.join(MODULE_BUILD, "templates/diagnostics.hbs"), "utf8");
  assert(template.includes('aria-busy="{{busy}}"'), "Dashboard root must expose its busy state.");
  assert(template.includes('{{#if busy}}disabled{{/if}}'), "Dashboard controls must prevent conflicting actions while busy.");
  assert(template.includes('data-rmd-scan-progress'), "Scans page must include the reserved progress control.");
  const progressIndex = template.indexOf('class="rmd-scan-progress-shell');
  const scanGridIndex = template.indexOf('class="rmd-scan-grid');
  assert(progressIndex >= 0 && scanGridIndex > progressIndex, "Scan progress must remain a stable page element before scan cards.");
  assert(template.includes('<div class="rmd-scan-progress-shell {{#if scanBusy}}is-active{{/if}}"'), "Scan progress shell must remain present while only its active state changes.");

  const mainSource = await readFile(path.join(MODULE_BUILD, "scripts/main.js"), "utf8");
  const accessSource = await readFile(path.join(MODULE_BUILD, "scripts/core/access-control.js"), "utf8");
  assert(mainSource.includes('game.settings.register(MODULE_ID, ACCESS_SETTING_KEY'), "Player access must be registered as a Foundry setting.");
  assert(/game\.settings\.register\(MODULE_ID, ACCESS_SETTING_KEY, \{[\s\S]*?scope:\s*["']world["'][\s\S]*?config:\s*false/su.test(mainSource), "Player access must be a hidden world-scoped setting.");
  assert(/registerMenu\(MODULE_ID, ["']dashboard["'][\s\S]*?restricted:\s*false/su.test(mainSource), "Dashboard launcher must remain visible to authorized non-GM users.");
  assert(mainSource.includes("if (!isDiagnosticsAuthorized())"), "Dashboard opening must enforce runtime authorization.");
  assert(mainSource.includes("captureService?.uninstall();"), "Access revocation must uninstall client capture before discarding services.");
  assert(/if \(game\.user\?\.isGM\) \{[\s\S]*?diagnosticsApi\.getPlayerAccess[\s\S]*?diagnosticsApi\.setPlayerAccess/su.test(mainSource), "Access-administration API methods must be added only for a GM client.");
  assert(mainSource.includes("await application.close();"), "Access revocation must close an open diagnostics dashboard.");
  assert(accessSource.includes("if (user.isGM) return true;"), "Game Masters must remain unconditionally authorized.");
  assert(accessSource.includes("if (!game.user?.isGM) throw new Error"), "Player access mutation must be GM guarded in the access service.");
  assert(accessSource.includes("sanitizeAllowedUserIds"), "Persisted access must be sanitized against current non-GM users.");

  const accessBlockMatch = template.match(/\{\{#if isGM\}\}[\s\S]*?data-tab="access"[\s\S]*?\{\{\/if\}\}/u);
  assert(Boolean(accessBlockMatch), "The Access navigation control must render only for a GM.");
  assert(template.includes('data-rmd-action="save-player-access"'), "GM Access UI must provide an explicit save action.");
  assert(template.includes('name="allowedUsers"'), "GM Access UI must expose per-user selection checkboxes.");
  assert(template.includes('class="rmd-user-list"'), "Player selector must be a bounded scrollable list.");

  const applicationSource = await readFile(path.join(MODULE_BUILD, "scripts/app/diagnostics-app.js"), "utf8");
  assert(applicationSource.includes("async _preClose(options)"), "ApplicationV2 close lifecycle cleanup is required.");
  assert(applicationSource.includes("#operationController?.abort"), "Closing the dashboard must cancel active diagnostics work.");
  assert(applicationSource.includes("onProgress: (update) => this.#updateScanProgress(update)"), "Dashboard scans must forward granular progress updates.");
  assert(!applicationSource.includes("RMD.Notifications.ScanComplete"), "Scan completion must not generate repetitive notification noise.");
  assert(!/async _preClose[\s\S]{0,1500}await game\.settings\.set/gu.test(applicationSource), "Window-state persistence must not block ApplicationV2 closure.");
  assert(applicationSource.includes('if (nextTab === "access" && !game.user?.isGM) break;'), "Non-GM clients must not navigate to the Access tab through the action handler.");
  assert(applicationSource.includes('if (!game.user?.isGM) return;'), "Non-GM clients must not mutate access checkboxes through the change handler.");
  assert(applicationSource.includes('const savedIds = await setAllowedUserIds'), "Access changes must pass through the guarded access service.");

  const diagnosticsSource = await readFile(path.join(MODULE_BUILD, "scripts/services/diagnostics-service.js"), "utf8");
  assert(diagnosticsSource.includes("normalizePackageAssetPath"), "Asset scans must canonicalize Foundry package paths.");
  assert(!diagnosticsSource.includes("pkg.minimumCoreVersion"), "V13 diagnostics must not read deprecated minimumCoreVersion.");
  assert(!diagnosticsSource.includes("pkg.compatibleCoreVersion"), "V13 diagnostics must not read deprecated compatibleCoreVersion.");
  assert(!diagnosticsSource.includes("pkg.maximumCoreVersion"), "V13 diagnostics must not read deprecated maximumCoreVersion.");

  const reportSource = await readFile(path.join(MODULE_BUILD, "scripts/services/report-service.js"), "utf8");
  assert(!/pkg\.compatibility\.(?:minimum|verified|maximum)/u.test(reportSource), "Report generation must not directly dereference optional package compatibility metadata.");
  assert(reportSource.includes("compatibilityMarkdown"), "Report generation must normalize optional compatibility metadata before formatting Markdown.");

  const captureSource = await readFile(path.join(MODULE_BUILD, "scripts/services/capture-service.js"), "utf8");
  const installStart = captureSource.indexOf("  install(");
  const focusedStart = captureSource.indexOf("  startFocused(");
  const installBody = captureSource.slice(installStart, focusedStart);
  assert(!installBody.includes("#installConsoleWrappers()"), "Background capture must not permanently wrap console methods.");
  assert(captureSource.slice(focusedStart).includes("this.#installConsoleWrappers()"), "Focused capture must install temporary console wrappers.");
  assert(captureSource.includes("if (!focusedLevels.has(level)) continue;"), "Focused capture must wrap only requested console levels.");

  const downloadSource = await readFile(path.join(MODULE_BUILD, "scripts/utils/download.js"), "utf8");
  assert(!downloadSource.includes("queueMicrotask"), "Download URLs must not be revoked in the same microtask.");
  assert(/setTimeout\([^,]+,\s*1_000\)/su.test(downloadSource), "Download URL revocation requires a browser handoff delay.");

  const constantsSource = await readFile(path.join(MODULE_BUILD, "scripts/core/constants.js"), "utf8");
  assert(constantsSource.includes(`MODULE_VERSION = "${manifest.version}"`), "Runtime module version must match the manifest.");

  const localizationObjects = new Map();
  for (const language of manifest.languages ?? []) {
    try {
      localizationObjects.set(language.lang, JSON.parse(await readFile(path.join(MODULE_BUILD, language.path), "utf8")));
    } catch (error) {
      assert(false, `Invalid localization JSON ${language.path}: ${error.message}`);
    }
  }
  const flattenLocalization = (value, prefix = "", output = new Map()) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [key, child] of Object.entries(value)) {
        flattenLocalization(child, prefix ? `${prefix}.${key}` : key, output);
      }
    } else output.set(prefix, String(value ?? ""));
    return output;
  };
  const localizationKeys = new Map([...localizationObjects].map(([lang, value]) => [lang, flattenLocalization(value)]));
  const english = localizationKeys.get("en");
  if (english) {
    for (const [lang, dictionary] of localizationKeys) {
      if (lang === "en") continue;
      const missing = [...english.keys()].filter((key) => !dictionary.has(key));
      const extra = [...dictionary.keys()].filter((key) => !english.has(key));
      assert(missing.length === 0, `${lang} localization is missing keys: ${missing.join(", ")}`);
      assert(extra.length === 0, `${lang} localization has extra keys: ${extra.join(", ")}`);
      for (const [key, englishValue] of english) {
        if (!dictionary.has(key)) continue;
        const placeholders = (text) => [...text.matchAll(/\{([A-Za-z0-9_]+)\}/gu)].map((match) => match[1]).sort();
        assert(JSON.stringify(placeholders(englishValue)) === JSON.stringify(placeholders(dictionary.get(key))), `${lang} localization placeholder mismatch for ${key}.`);
      }
    }
  }

  const allSource = await Promise.all(javascriptFiles.map((file) => readFile(path.join(MODULE_BUILD, file), "utf8")));
  const combined = allSource.join("\n");
  assert(!/Hooks\.(?:on|once)\(\s*["']renderApplication["']/u.test(combined), "Generic renderApplication hook is prohibited.");
  assert(!/\.prototype\.[A-Za-z_$][\w$]*\s*=/u.test(combined), "Prototype monkey patching is prohibited.");
  assert(!/game\._|foundry\._|Hooks\._/u.test(combined), "Private Foundry API access is prohibited.");
  assert(!/eval\s*\(|new\s+Function\s*\(/u.test(combined), "Dynamic code execution is prohibited.");
  assert(!/socket\.emit|game\.socket/u.test(combined), "This client-only diagnostics module must not use sockets.");
  assert(!files.some((file) => file.endsWith(".map")), "Source maps must not be included in the installable module.");

  const composed = (...parts) => parts.join("");
  const licenceLine = `Copyright © 2026  [Daniel ${composed("Branie", "wski")}](https://brani.dev/)`;
  const holderFragment = composed("// Copyright (C) 2026 Daniel ", "Braniewski. See the LICENSE file for rights and obligations.");
  const identityPatterns = [
    new RegExp(composed("aki", "to"), "iu"),
    new RegExp(composed("Branie", "wski"), "iu"),
    new RegExp(composed("akki", "@"), "iu"),
    new RegExp(composed("ik", "\\.me"), "iu"),
    new RegExp(composed("/mnt", "/"), "u"),
    new RegExp(composed("/home", "/"), "u"),
    new RegExp(composed("/Users", "/"), "u")
  ];
  for (const relative of sourceFiles) {
    if (relative.startsWith("build/") || relative.startsWith("release/") || relative.startsWith("node_modules/")) continue;
    const raw = await readFile(path.join(ROOT, relative));
    const decoded = relative === "README.md"
      ? raw.toString("utf8").replace(licenceLine, "")
      : raw.toString("latin1").replace(holderFragment, "");
    assert(!identityPatterns.some((pattern) => pattern.test(decoded)), `${relative}: publication identity material.`);
    if (relative.endsWith(".js") || relative.endsWith(".mjs")) {
      assert(raw.toString("utf8").startsWith("// SPDX-License-Identifier: AGPL-3.0-or-later\n"), `${relative}: missing AGPL source header.`);
    }
  }
  if (files.length > 100) warnings.push(`Installable package has ${files.length} files; review package scope.`);
  console.log(`Validated ${files.length} installable files.`);
}

for (const warning of warnings) console.warn(`WARNING: ${warning}`);
if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exitCode = 1;
} else {
  console.log("Validation passed.");
}
