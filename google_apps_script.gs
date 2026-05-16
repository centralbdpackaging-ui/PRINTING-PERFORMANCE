// ============================================================
//  PRINTING DASHBOARD — Google Apps Script
//  ✅ Spreadsheet: 1epBUih2J2PzAc1BL-qBGm6iyDRNNTo6gxR47a8StrNQ
//  ✅ Sheet: "Daily Record"
//  ✅ Columns: A to J
// ============================================================

const SPREADSHEET_ID = "1epBUih2J2PzAc1BL-qBGm6iyDRNNTo6gxR47a8StrNQ";
const SHEET_NAME = "Daily Record";

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);

  try {
    const result = getDashboardData(params);
    output.setContent(JSON.stringify(result));
  } catch (err) {
    output.setContent(JSON.stringify({ error: err.message }));
  }

  return output;
}

function doOptions(e) {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function getDashboardData(params) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const tz = ss.getSpreadsheetTimeZone();
  const sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    throw new Error('Sheet "' + SHEET_NAME + '" not found!');
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { rawData: [], lastUpdated: new Date().getTime() };
  }

  // Get range A1:J (Assuming Row 1 is header)
  const range = sheet.getRange(1, 1, lastRow, 10);
  const data = range.getValues();

  const headers = data[0].map((h) => String(h).trim());
  const rows = data.slice(1);

  const rawData = rows
    .map((row) => {
      const obj = {};
      headers.forEach((h, i) => {
        let val = row[i];
        if (val instanceof Date) {
          // Format time specifically if it looks like a time column (e.g. Last Update Time)
          if (h.toLowerCase().includes("time")) {
            obj[h] = Utilities.formatDate(val, tz, "hh:mm:ss a");
          } else {
            obj[h] = Utilities.formatDate(val, tz, "yyyy-MM-dd");
          }
        } else {
          obj[h] = val !== "" && val !== null && val !== undefined ? val : "";
        }
      });
      return obj;
    })
    .filter((row) => {
      // Keep rows that have at least a machine number
      return row["Machine No"] && String(row["Machine No"]).trim() !== "";
    });

  return {
    rawData: rawData,
    debug: {
      sourceUsed: SHEET_NAME,
      totalRows: rawData.length,
      timezone: tz,
      lastUpdated: Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm:ss"),
    },
    lastUpdated: new Date().getTime(),
  };
}
