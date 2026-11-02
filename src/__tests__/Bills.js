/**
 * @jest-environment jsdom
 */

import "@testing-library/jest-dom"
import {screen, waitFor} from "@testing-library/dom"
import userEvent from "@testing-library/user-event"
import BillsUI from "../views/BillsUI.js"
import Bills from "../containers/Bills.js"
import { bills } from "../fixtures/bills.js"
import { ROUTES_PATH} from "../constants/routes.js";
import {localStorageMock} from "../__mocks__/localStorage.js";
import mockStore from "../__mocks__/store"

import router from "../app/Router.js";

// le router utilise le faux store (mock de l'API) au lieu du vrai back-end
jest.mock("../app/Store", () => mockStore)

// navigue vers la page Bills par le router, comme dans l'application
const goToBillsPage = () => {
  const root = document.createElement("div")
  root.setAttribute("id", "root")
  document.body.append(root)
  router()
  window.onNavigate(ROUTES_PATH.Bills)
}

// lit le tableau affiché : une ligne = [type, nom, date, montant, statut, actions]
const displayedRows = () =>
  [...screen.getByTestId("tbody").querySelectorAll("tr")]
    .map(tr => [...tr.children].map(td => td.textContent.trim()))

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: localStorageMock })
  window.localStorage.setItem('user', JSON.stringify({ type: 'Employee', email: 'employee@test.tld' }))
  document.body.innerHTML = ""
  window.history.replaceState({}, "", "/")
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe("Given I am connected as an employee", () => {
  describe("When I am on Bills Page", () => {
    test("Then bill icon in vertical layout should be highlighted", async () => {

      Object.defineProperty(window, 'localStorage', { value: localStorageMock })
      window.localStorage.setItem('user', JSON.stringify({
        type: 'Employee'
      }))
      const root = document.createElement("div")
      root.setAttribute("id", "root")
      document.body.append(root)
      router()
      window.onNavigate(ROUTES_PATH.Bills)
      await waitFor(() => screen.getByTestId('icon-window'))
      const windowIcon = screen.getByTestId('icon-window')
      expect(windowIcon).toHaveClass('active-icon')
      expect(screen.getByTestId('icon-mail')).not.toHaveClass('active-icon')

    })
    test("Then bills should be ordered from earliest to latest", () => {
      document.body.innerHTML = BillsUI({ data: bills })
      const dates = screen.getAllByText(/^(19|20)\d\d[- /.](0[1-9]|1[012])[- /.](0[1-9]|[12][0-9]|3[01])$/i).map(a => a.innerHTML)
      const antiChrono = (a, b) => ((a < b) ? 1 : -1)
      const datesSorted = [...dates].sort(antiChrono)
      expect(dates).toEqual(datesSorted)
    })
  })

  // test d'intégration GET
  describe("When I navigate to the Bills page", () => {
    test("Then the bills of the mock API should be displayed, most recent first, with formatted dates", async () => {
      goToBillsPage()

      await waitFor(() => screen.getByTestId("tbody"))
      const rows = displayedRows()

      expect(rows).toHaveLength(4)
      expect(rows.map(row => row[1])).toEqual(["encore", "test3", "test2", "test1"])
      expect(rows.map(row => row[2])).toEqual(["4 Avr. 04", "3 Mar. 03", "2 Fév. 02", "1 Jan. 01"])
      expect(rows[0][0]).toBe("Hôtel et logement")
      expect(rows[0][3]).toBe("400 €")
      expect(rows[0][4]).toBe("En attente")
      expect(screen.getByText("Mes notes de frais")).toBeInTheDocument()
    })

    test("Then the page should be in a loading state before the bills arrive", () => {
      goToBillsPage()
      expect(screen.getByText("Loading...")).toBeInTheDocument()
    })
  })

  describe("When an error occurs on API", () => {
    test.each(["404", "500"])("Then the bills fetch fails with a %s message error", async (code) => {
      jest.spyOn(mockStore, "bills").mockImplementationOnce(() => ({
        list: () => Promise.reject(new Error(`Erreur ${code}`)),
      }))

      goToBillsPage()

      await waitFor(() => screen.getByTestId("error-message"))
      expect(screen.getByTestId("error-message")).toHaveTextContent(`Erreur ${code}`)
      expect(screen.queryByTestId("tbody")).not.toBeInTheDocument()
    })
  })

  describe("When I am on Bills Page and I click on the new bill button", () => {
    test("Then I should be sent to the NewBill page", async () => {
      goToBillsPage()
      await waitFor(() => screen.getByTestId("tbody"))

      userEvent.click(screen.getByTestId("btn-new-bill"))

      await waitFor(() => expect(screen.getByTestId("form-new-bill")).toBeInTheDocument())
      expect(screen.getByTestId("icon-mail")).toHaveClass("active-icon")
    })
  })

  describe("When I am on Bills Page and I click on the eye icon of a bill", () => {
    beforeEach(() => {
      // la modale vient de Bootstrap, qui n'est pas chargé dans Jest : on la simule
      $.fn.modal = jest.fn()
    })
    afterEach(() => {
      delete $.fn.modal
    })

    test("Then a modal should open with the proof image of this bill", () => {
      document.body.innerHTML = BillsUI({ data: bills })
      new Bills({ document, onNavigate: jest.fn(), store: null, localStorage: window.localStorage })
      const eyeIcon = screen.getAllByTestId("icon-eye")[0]

      userEvent.click(eyeIcon)

      expect($.fn.modal).toHaveBeenCalledWith("show")
      const image = document.querySelector("#modaleFile .modal-body img")
      expect(image).toHaveAttribute("alt", "Bill")
      expect(image).toHaveAttribute("src", eyeIcon.getAttribute("data-bill-url"))
    })
  })

  describe("When getBills is called", () => {
    // copie de la fixture, dans l'ordre d'origine : 2004, 2001, 2003, 2002
    const buildStore = (apiBills) => ({ bills: () => ({ list: () => Promise.resolve(apiBills) }) })
    const buildBills = (store) =>
      new Bills({ document, onNavigate: jest.fn(), store, localStorage: window.localStorage })

    test("Then bills should be sorted from the most recent, with formatted dates and status", async () => {
      const apiBills = bills.map(bill => ({ ...bill }))

      const result = await buildBills(buildStore(apiBills)).getBills()

      expect(result.map(bill => bill.name)).toEqual(["encore", "test3", "test2", "test1"])
      expect(result.map(bill => bill.date)).toEqual(["4 Avr. 04", "3 Mar. 03", "2 Fév. 02", "1 Jan. 01"])
      expect(result.map(bill => bill.status)).toEqual(["En attente", "Accepté", "Refused", "Refused"])
    })

    test("Then the array received from the API should not be modified", async () => {
      const apiBills = bills.map(bill => ({ ...bill }))

      await buildBills(buildStore(apiBills)).getBills()

      expect(apiBills.map(bill => bill.name)).toEqual(["encore", "test1", "test3", "test2"])
      expect(apiBills.map(bill => bill.date)).toEqual(["2004-04-04", "2001-01-01", "2003-03-03", "2002-02-02"])
    })

    test("Then a bill with a corrupted date should still be returned with its raw date", async () => {
      const consoleLog = jest.spyOn(console, "log").mockImplementation(() => {})
      const corrupted = { ...bills[0], date: "pas-une-date" }

      const result = await buildBills(buildStore([corrupted])).getBills()

      expect(result).toHaveLength(1)
      expect(result[0].date).toBe("pas-une-date")
      expect(result[0].status).toBe("En attente")
      expect(consoleLog).toHaveBeenCalledWith(expect.any(Error), "for", corrupted)
    })

    test("Then nothing should be fetched when there is no store", () => {
      expect(buildBills(null).getBills()).toBeUndefined()
    })
  })
})
