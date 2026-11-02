/**
 * @jest-environment jsdom
 */

import "@testing-library/jest-dom"
import { fireEvent, screen, waitFor } from "@testing-library/dom"
import userEvent from "@testing-library/user-event"
import NewBillUI from "../views/NewBillUI.js"
import NewBill from "../containers/NewBill.js"
import { ROUTES_PATH } from "../constants/routes.js"
import mockStore from "../__mocks__/store"
import router from "../app/Router.js"

// le router utilise le faux store (mock de l'API) au lieu du vrai back-end
jest.mock("../app/Store", () => mockStore)

const employee = { type: "Employee", email: "employee@test.tld" }

// ouvre le formulaire "Nouvelle note de frais" et branche un NewBill sur ce formulaire
const buildNewBillPage = () => {
  document.body.innerHTML = NewBillUI()
  const onNavigate = jest.fn()
  const newBill = new NewBill({ document, onNavigate, store: mockStore, localStorage: window.localStorage })
  return { newBill, onNavigate }
}

// simule le choix d'un justificatif dans le champ fichier
const chooseFile = (name, type) => {
  const input = screen.getByTestId("file")
  userEvent.upload(input, new File(["contenu du justificatif"], name, { type }))
  return input
}

// navigue vers la page NewBill par le router, comme dans l'application
const goToNewBillPage = () => {
  const root = document.createElement("div")
  root.setAttribute("id", "root")
  document.body.append(root)
  router()
  window.onNavigate(ROUTES_PATH.NewBill)
}

beforeEach(() => {
  window.localStorage.setItem("user", JSON.stringify(employee))
  document.body.innerHTML = ""
  window.history.replaceState({}, "", "/")
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe("Given I am connected as an employee", () => {
  describe("When I am on NewBill Page", () => {
    test("Then the new bill form should be displayed with all its fields", () => {
      document.body.innerHTML = NewBillUI()
      expect(screen.getByTestId("form-new-bill")).toBeInTheDocument()
      expect(screen.getByTestId("expense-type")).toHaveValue("Transports")
      expect(screen.getByTestId("expense-name")).toHaveValue("")
      expect(screen.getByTestId("datepicker")).toHaveValue("")
      expect(screen.getByTestId("amount")).toHaveValue(null)
      expect(screen.getByTestId("vat")).toHaveValue(null)
      expect(screen.getByTestId("pct")).toHaveValue(null)
      expect(screen.getByTestId("commentary")).toHaveValue("")
      expect(screen.getByTestId("file")).toBeRequired()
      expect(screen.getByText("Envoyer")).toBeInTheDocument()
    })

    test("Then the mail icon in the vertical layout should be highlighted", () => {
      goToNewBillPage()
      expect(screen.getByTestId("icon-mail")).toHaveClass("active-icon")
      expect(screen.getByTestId("icon-window")).not.toHaveClass("active-icon")
    })
  })

  describe("When I choose a proof file with a valid format (jpg, jpeg or png)", () => {
    test.each([
      ["facture.png", "image/png"],
      ["photo.jpg", "image/jpeg"],
      ["scan.jpeg", "image/jpeg"],
      ["PHOTO.JPG", "image/jpeg"],
    ])("Then %s should be sent to the API and kept for the bill", async (fileName, fileType) => {
      const { newBill } = buildNewBillPage()
      const create = jest.spyOn(mockStore.bills(), "create")

      const input = chooseFile(fileName, fileType)

      expect(create).toHaveBeenCalledTimes(1)
      const { data, headers } = create.mock.calls[0][0]
      expect(data.get("file").name).toBe(fileName)
      expect(data.get("email")).toBe(employee.email)
      expect(headers).toEqual({ noContentType: true })
      expect(input.validity.customError).toBe(false)
      await waitFor(() => expect(newBill.billId).toBe("1234"))
      expect(newBill.fileUrl).toBe("https://localhost:3456/images/test.jpg")
      expect(newBill.fileName).toBe(fileName)
    })
  })

  describe("When I choose a proof file with an invalid format", () => {
    test.each([
      ["facture.pdf", "application/pdf"],
      ["logo.gif", "image/gif"],
      ["scan.png.pdf", "application/pdf"],
      ["sansextension", ""],
    ])("Then %s should be refused with an error message and not be sent", (fileName, fileType) => {
      const { newBill } = buildNewBillPage()
      const create = jest.spyOn(mockStore.bills(), "create")

      const input = chooseFile(fileName, fileType)

      expect(create).not.toHaveBeenCalled()
      expect(input.validity.customError).toBe(true)
      expect(input.validationMessage).toBe("Seuls les fichiers jpg, jpeg ou png sont acceptés.")
      expect(newBill.fileUrl).toBeNull()
      expect(newBill.fileName).toBeNull()
    })

    test("Then the error message should disappear when I choose a valid file afterwards", () => {
      buildNewBillPage()
      const create = jest.spyOn(mockStore.bills(), "create")

      const input = chooseFile("facture.pdf", "application/pdf")
      expect(input.validity.customError).toBe(true)

      chooseFile("facture.png", "image/png")
      expect(input.validity.customError).toBe(false)
      expect(input.validationMessage).not.toBe("Seuls les fichiers jpg, jpeg ou png sont acceptés.")
      expect(create).toHaveBeenCalledTimes(1)
    })
  })

  describe("When I open the file selection and cancel it", () => {
    test("Then nothing should be sent to the API and no error should be shown", () => {
      buildNewBillPage()
      const create = jest.spyOn(mockStore.bills(), "create")
      const input = screen.getByTestId("file")

      fireEvent.change(input, { target: { files: [] } })

      expect(create).not.toHaveBeenCalled()
      expect(input.validity.customError).toBe(false)
    })
  })

  describe("When I fill the form with correct values and I click on Envoyer", () => {
    test("Then the bill should be sent to the API (POST) and I should be sent to the Bills page", async () => {
      goToNewBillPage()
      const create = jest.spyOn(mockStore.bills(), "create")
      const update = jest.spyOn(mockStore.bills(), "update")

      userEvent.selectOptions(screen.getByTestId("expense-type"), "Hôtel et logement")
      userEvent.type(screen.getByTestId("expense-name"), "Hôtel Lyon")
      fireEvent.change(screen.getByTestId("datepicker"), { target: { value: "2022-03-15" } })
      userEvent.type(screen.getByTestId("amount"), "348")
      userEvent.type(screen.getByTestId("vat"), "70")
      userEvent.type(screen.getByTestId("pct"), "20")
      userEvent.type(screen.getByTestId("commentary"), "Séminaire client")
      chooseFile("billet.png", "image/png")
      await create.mock.results[0].value

      fireEvent.submit(screen.getByTestId("form-new-bill"))

      expect(update).toHaveBeenCalledTimes(1)
      const { data, selector } = update.mock.calls[0][0]
      expect(selector).toBe("1234")
      expect(JSON.parse(data)).toEqual({
        email: employee.email,
        type: "Hôtel et logement",
        name: "Hôtel Lyon",
        amount: 348,
        date: "2022-03-15",
        vat: "70",
        pct: 20,
        commentary: "Séminaire client",
        fileUrl: "https://localhost:3456/images/test.jpg",
        fileName: "billet.png",
        status: "pending",
      })
      await waitFor(() => expect(screen.getByText("Mes notes de frais")).toBeInTheDocument())
      expect(screen.getByTestId("tbody")).toBeInTheDocument()
    })

    test("Then the bill should use 20 as default percentage when I leave it empty", async () => {
      const { newBill, onNavigate } = buildNewBillPage()
      const update = jest.spyOn(mockStore.bills(), "update")
      chooseFile("billet.png", "image/png")
      await waitFor(() => expect(newBill.billId).toBe("1234"))

      fireEvent.submit(screen.getByTestId("form-new-bill"))

      expect(JSON.parse(update.mock.calls[0][0].data).pct).toBe(20)
      expect(onNavigate).toHaveBeenCalledWith(ROUTES_PATH.Bills)
    })
  })

  describe("When the API returns an error", () => {
    test.each(["404", "500"])("Then an error %s on the file upload should be logged and no file kept", async (code) => {
      const { newBill } = buildNewBillPage()
      const consoleError = jest.spyOn(console, "error").mockImplementation(() => {})
      jest.spyOn(mockStore, "bills").mockImplementationOnce(() => ({
        create: () => Promise.reject(new Error(`Erreur ${code}`)),
      }))

      chooseFile("facture.png", "image/png")

      await waitFor(() => expect(consoleError).toHaveBeenCalledWith(new Error(`Erreur ${code}`)))
      expect(newBill.fileUrl).toBeNull()
      expect(newBill.billId).toBeNull()
    })

    test.each(["404", "500"])("Then an error %s on the bill submission should be logged", async (code) => {
      const { newBill } = buildNewBillPage()
      chooseFile("facture.png", "image/png")
      await waitFor(() => expect(newBill.billId).toBe("1234"))
      const consoleError = jest.spyOn(console, "error").mockImplementation(() => {})
      jest.spyOn(mockStore, "bills").mockImplementationOnce(() => ({
        update: () => Promise.reject(new Error(`Erreur ${code}`)),
      }))

      fireEvent.submit(screen.getByTestId("form-new-bill"))

      await waitFor(() => expect(consoleError).toHaveBeenCalledWith(new Error(`Erreur ${code}`)))
    })
  })
})
