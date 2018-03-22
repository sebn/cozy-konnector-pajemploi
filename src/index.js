const {
  BaseKonnector,
  log,
  requestFactory,
  saveFiles
} = require('cozy-konnector-libs')
const groupBy = require('lodash.groupby')
const map = require('lodash.map')

const request = requestFactory({
  cheerio: true,
  // debug: true,
  jar: true,
  json: false
})

const baseUrl = 'http://www.pajemploi.urssaf.fr/pajeweb'
const loginUrl = baseUrl + '/j_spring_security_check'
const logoutUrl = baseUrl + '/j_spring_security_logout'
const listUrl = baseUrl + '/ajaxlistebs.jsp'
const downloadUrl = baseUrl + '/paje_bulletinsalaire.pdf'

module.exports = new BaseKonnector(function fetch(fields) {
  return authenticate(fields.login, fields.password)
    .then(fetchPayslips)
    .then(fetchPayslipFiles)
    .catch(err => {
      log('error', err.message)
      this.terminate('UNKNOWN_ERROR')
    })
})

function authenticate(login, password) {
  log('info', 'Authenticating...')
  return request({
    method: 'POST',
    uri: loginUrl,
    form: {
      j_username: login,
      j_password: password,
      j_passwordfake: password
    }
  }).then($ => {
    if (pageContainsLoginForm($)) {
      log('error', 'Login form still visible: login failed.')
      throw new Error('LOGIN_FAILED')
    } else if (pageContainsLogoutLink($)) {
      log('info', 'Logout link found: login successful.')
    } else {
      log('warn', 'Cannot find login form or logout link: where am I?')
    }
  })
}

function pageContainsLoginForm($) {
  return $('input#j_username').length > 0
}
function pageContainsLogoutLink($) {
  return $(`a[href="${logoutUrl}"]`)
}

function fetchPayslips() {
  const today = new Date()
  const startYear = '2004' // Pajemploi exists since 2004
  const startMonth = '01'
  const endYear = today.getFullYear().toString()
  const endMonth = `0${today.getMonth() + 1}`.slice(-2)

  log(
    'info',
    'Looking for payslips between ' +
      `${startMonth}/${startYear} and ${endMonth}/${endYear}...`
  )

  return request({
    method: 'POST',
    uri: listUrl,
    form: {
      activite: 'T',
      byAsc: 'false',
      dtDebAnnee: startYear,
      dtDebMois: startMonth,
      dtFinAnnee: endYear,
      dtFinMois: endMonth,
      noIntSala: '',
      order: 'periode',
      paye: 'false'
    }
  })
    .then(parsePayslipList)
    .then(payslips => {
      if (payslips.length > 0) {
        log('info', `Found ${payslips.length} payslips.`)
      } else {
        log('warn', 'No payslips found.')
      }
      return groupBy(payslips, 'employee')
    })
}

function parsePayslipList($) {
  log('info', 'Parsing payslip list...')
  return Array.from($('#tabVsTous tr[onclick]')).map(tr =>
    parsePayslipRow($(tr))
  )
}

const jsCodeRegExp = /^document\.getElementById\('ref'\)\.value='([^']+)';document\.getElementById\('norng'\)\.value='([^']+)';document\.formBulletinSalaire\.submit\(\);$/

function parsePayslipRow($tr) {
  const [month, year] = $tr
    .find('td:nth-child(1)')
    .text()
    .split('/')
  const employee = $tr.find('td:nth-child(2)').text()
  const amount = $tr
    .find('td:nth-child(3)')
    .text()
    .trim()
  const [ref, norng] = jsCodeRegExp.exec($tr.attr('onclick')).slice(1, 3)
  return {
    period: `${year}-${month}`,
    employee,
    amount,
    ref,
    norng
  }
}

function fetchPayslipFiles(payslipsByEmployee) {
  return Promise.all(
    map(payslipsByEmployee, (payslips, employee) => {
      const files = payslips.map(fileEntry)
      const folderPath = employee
      return saveFiles(files, folderPath)
    })
  )
}

function fileEntry({ period, ref, norng }) {
  return {
    fileurl: downloadUrl,
    filename: `${period}.pdf`,
    requestOptions: {
      method: 'POST',
      formData: {
        ref,
        norng
      }
    }
  }
}
