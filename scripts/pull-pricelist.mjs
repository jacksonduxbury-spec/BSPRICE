// Snapshot the "Brohn Smith - Price List" sheet (COSTING + GEMS) into lib/pricelist.json.
// Run: node scripts/pull-pricelist.mjs   (uses the Sheets service account on this Mac)
import { createRequire } from 'module'
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const require = createRequire('/Users/keith/tools/mcp-gsheets/')
const { google } = require('googleapis')

const SHEET_ID = '1OlurC6XuA6gl7R_p976XGmSouujXvLJuXn-NveiyQ5c'
const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS || '/Users/keith/.gcp/sheets-mcp-sa.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
})
const sheets = google.sheets({ version: 'v4', auth })
const { data } = await sheets.spreadsheets.values.batchGet({
  spreadsheetId: SHEET_ID,
  ranges: ['COSTING!A3:N', 'GEMS!A2:I'],
  valueRenderOption: 'UNFORMATTED_VALUE',
})
const num = v => (typeof v === 'number' && isFinite(v) ? v : null)
const str = v => (v == null ? '' : String(v).trim())

const rows = (data.valueRanges[0].values || [])
  .filter(r => str(r[0]) && str(r[2]))
  .map(r => ({
    product: str(r[0]), category: str(r[1]), metal: str(r[2]), size: str(r[3]), build: str(r[4]),
    rrp: num(r[12]),   // retail only: weights and costs stay in the sheet
  }))
const gems = (data.valueRanges[1].values || [])
  .filter(r => str(r[0]))
  .map(r => ({
    code: str(r[0]), description: str(r[1]), colour: str(r[2]), cut: str(r[3]),
    carat: num(r[4]), retailIncGst: num(r[8]),
  }))

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'pricelist.json')
writeFileSync(out, JSON.stringify({ pulledAt: new Date().toISOString(), rows, gems }, null, 1))
console.log(`${rows.length} costing rows, ${gems.length} gems -> lib/pricelist.json`)
