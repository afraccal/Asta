import { expect, test, type Page } from "@playwright/test";
import { apriLotto, creaScenario, rilancia, type Scenario } from "./scenario";

/**
 * Test end-to-end della sala.
 *
 * Coprono le tre cose che un test sulle sole API non vede: che la sala si
 * carichi davvero, che un rilancio altrui compaia sullo schermo senza
 * ricaricare, e che i controlli si accendano e si spengano quando devono.
 */

async function entra(page: Page, code: string, nome: string) {
  await page.goto(`/a/${code}/room`);

  // Chi apre il link per la prima volta deve dare un nome. La schermata
  // compare solo dopo il controllo della sessione, quindi va attesa: guardare
  // subito dopo il goto significa non trovarla e restare fermi sul gate.
  const campo = page.getByPlaceholder("Marco");
  await campo.waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});

  if (await campo.isVisible().catch(() => false)) {
    await campo.fill(nome);
    await page.getByRole("button", { name: /^entra$/i }).click();
  }

  // Si e' dentro quando l'intestazione della sala e' a schermo.
  await expect(page.getByTitle("Storico e rose")).toBeVisible({ timeout: 25_000 });
}

test.describe("la sala d'asta", () => {
  let scenario: Scenario;

  test.beforeEach(async () => {
    scenario = await creaScenario();
  });

  test("si carica e mostra i tavoli di tutte le squadre", async ({ page }) => {
    await entra(page, scenario.code, "Ospite");

    // La regressione da cui nasce questo test: la sala restava su
    // "Ingresso in sala..." quando il canale realtime non si apriva.
    await expect(page.getByText(/ingresso in sala/i)).toHaveCount(0);

    await expect(page.getByRole("heading", { name: "Squadra Regista" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Squadra Avversaria" }).first()).toBeVisible();
  });

  test("chi non ha squadra puo' sedersi a un tavolo libero", async ({ page }) => {
    await entra(page, scenario.code, "Ospite");

    await expect(page.getByText(/non hai una squadra/i)).toBeVisible();
    await page.getByRole("button", { name: new RegExp(scenario.postiLiberi[0].name, "i") }).click();

    // Seduto: al posto dei tavoli liberi compaiono i controlli di offerta
    // oppure la chiamata, a seconda del turno.
    await expect(page.getByText(/non hai una squadra/i)).toHaveCount(0, { timeout: 15_000 });
  });

  test("il rilancio di un altro partecipante compare senza ricaricare", async ({ page }) => {
    const lotId = await apriLotto(scenario, "Baggio");
    await entra(page, scenario.code, "Ospite");

    await expect(page.getByText("BAGGIO")).toBeVisible({ timeout: 20_000 });

    // Apertura a 1 credito in mano a chi ha chiamato
    const offerta = page.locator(".stage-bid p.tabular").first();
    await expect(offerta).toHaveText("1");

    // Nessuno tocca questo browser: il rilancio arriva da un'altra sessione.
    await rilancia(scenario, lotId, 27);

    await expect(offerta).toHaveText("27", { timeout: 15_000 });

    // Il nome del nuovo leader va cercato SUL PALCO: i tavoli laterali
    // esistono nel DOM anche quando la disposizione non li mostra, e una
    // ricerca globale pescherebbe una copia nascosta.
    await expect(page.locator(".stage-bid").getByText("Squadra Avversaria")).toBeVisible();
  });

  test("lo storico si apre e mostra le aggiudicazioni", async ({ page }) => {
    await entra(page, scenario.code, "Ospite");

    await page.getByTitle("Storico e rose").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByText(/0 assegnati/)).toBeVisible();
  });
});
