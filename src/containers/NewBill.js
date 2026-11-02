import { ROUTES_PATH } from '../constants/routes.js'
import Logout from "./Logout.js"

export default class NewBill {
  constructor({ document, onNavigate, store, localStorage }) {
    this.document = document
    this.onNavigate = onNavigate
    this.store = store
    const formNewBill = this.document.querySelector(`form[data-testid="form-new-bill"]`)
    formNewBill.addEventListener("submit", this.handleSubmit)
    const file = this.document.querySelector(`input[data-testid="file"]`)
    file.addEventListener("change", this.handleChangeFile)
    this.fileUrl = null
    this.fileName = null
    this.billId = null
    new Logout({ document, localStorage, onNavigate })
  }
  handleChangeFile = e => {
    e.preventDefault()
    const file = this.document.querySelector(`input[data-testid="file"]`).files[0]
    const filePath = e.target.value.split(/\\/g)
    const fileName = filePath[filePath.length-1]
    // [Bug hunt - Bills] Seuls les justificatifs jpg, jpeg ou png sont acceptés.
    // Le back-end enregistre 'null' comme nom et chemin de fichier pour tout autre format,
    // d'où le nom de fichier "null" côté admin et la modale sans image.
    //  - /\.(jpe?g|png)$/i : l'extension doit être la FIN du nom ("facture.png.pdf" est refusé),
    //    et le i ignore la casse (.PNG est accepté).
    //  - setCustomValidity + reportValidity : affiche un message d'erreur natif sur le champ ;
    //    tant qu'il n'est pas effacé, le champ est invalide et le formulaire ne peut pas être envoyé.
    //  - e.target.value = "" : vide le champ pour ne pas garder un fichier refusé.
    //  - return : on s'arrête avant l'envoi au back-end (store.bills().create).
    if (!/\.(jpe?g|png)$/i.test(fileName)) {
      e.target.setCustomValidity("Seuls les fichiers jpg, jpeg ou png sont acceptés.")
      e.target.reportValidity()
      e.target.value = ""
      return
    }
    // fichier valide : on efface un éventuel message d'erreur laissé par un choix précédent
    e.target.setCustomValidity("")
    const formData = new FormData()
    const email = JSON.parse(localStorage.getItem("user")).email
    formData.append('file', file)
    formData.append('email', email)

    this.store
      .bills()
      .create({
        data: formData,
        headers: {
          noContentType: true
        }
      })
      .then(({fileUrl, key}) => {
        console.log(fileUrl)
        this.billId = key
        this.fileUrl = fileUrl
        this.fileName = fileName
      }).catch(error => console.error(error))
  }
  handleSubmit = e => {
    e.preventDefault()
    console.log('e.target.querySelector(`input[data-testid="datepicker"]`).value', e.target.querySelector(`input[data-testid="datepicker"]`).value)
    const email = JSON.parse(localStorage.getItem("user")).email
    const bill = {
      email,
      type: e.target.querySelector(`select[data-testid="expense-type"]`).value,
      name:  e.target.querySelector(`input[data-testid="expense-name"]`).value,
      amount: parseInt(e.target.querySelector(`input[data-testid="amount"]`).value),
      date:  e.target.querySelector(`input[data-testid="datepicker"]`).value,
      vat: e.target.querySelector(`input[data-testid="vat"]`).value,
      pct: parseInt(e.target.querySelector(`input[data-testid="pct"]`).value) || 20,
      commentary: e.target.querySelector(`textarea[data-testid="commentary"]`).value,
      fileUrl: this.fileUrl,
      fileName: this.fileName,
      status: 'pending'
    }
    this.updateBill(bill)
    this.onNavigate(ROUTES_PATH['Bills'])
  }

  // not need to cover this function by tests
  updateBill = (bill) => {
    if (this.store) {
      this.store
      .bills()
      .update({data: JSON.stringify(bill), selector: this.billId})
      .then(() => {
        this.onNavigate(ROUTES_PATH['Bills'])
      })
      .catch(error => console.error(error))
    }
  }
}