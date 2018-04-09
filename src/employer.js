const { log, saveFiles } = require('cozy-konnector-libs')
const groupBy = require('lodash.groupby')
const map = require('lodash.map')

const { mkdirp } = require('./cozyhelpers')
const { baseUrl, request } = require('./request')

const listUrl = baseUrl + '/ajaxlistebs.jsp'
const downloadUrl = baseUrl + '/paje_bulletinsalaire.pdf'

module.exports = {
  fetchPayslips,
  fetchPayslipFiles,
  parsePeriod
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

// Download form is filled up and submitted from JavaScript
const jsCodeRegExp = /^document\.getElementById\('ref'\)\.value='([^']+)';document\.getElementById\('norng'\)\.value='([^']+)';document\.formBulletinSalaire\.submit\(\);$/

function parsePayslipRow($tr) {
  const periodString = $tr.find('td:nth-child(1)').text()
  const [year, month] = parsePeriod(periodString)
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

// For some reason, first date is formatted like "2018-01-01 00:00:00.0", while
// subsequent ones look like "01/2018".
const frDateRegExp = /\s*(\d{2})\/(\d{4}).*/
const isoDateRegExp = /\s*(\d{4})-(\d{2}).*/

function parsePeriod(dateString) {
  const frDateMatch = frDateRegExp.exec(dateString)
  if (frDateMatch) return frDateMatch.slice(1, 3).reverse()
  else return isoDateRegExp.exec(dateString).slice(1, 3)
}

function fetchPayslipFiles(payslipsByEmployee, folderPath) {
  return Promise.all(
    map(payslipsByEmployee, (payslips, employee) => {
      const files = payslips.map(fileEntry)
      return mkdirp(folderPath, employee).then(() =>
        saveFiles(files, `${folderPath}/${employee}`)
      )
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
