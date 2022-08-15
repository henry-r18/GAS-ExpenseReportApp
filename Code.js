//FUNCTIONS RELATED TO HTML SERVICE
function doGet(e) {
  return HtmlService.createTemplateFromFile('Index').evaluate();
}

function include(page) {
  return HtmlService.createHtmlOutputFromFile(page).getContent();
}

//FUNCTIONS RELATED TO DATA MERGE WITH GOOGLE SPREADSHEET
function handleForm(form, fileData) {
  //Parse serialized form from frontend
  form = JSON.parse(form);
  //Create metadata object related to the form submission that just occurred
  setSubmissionMetadata(form);
  //Set variable for stem of name of the submission that just occurred
  let submissionNameStem = form.metadata.submissionNameStem,
    uuid = form.metadata.uuid;
  //Set appropriate template and folder using their IDs
  let [templateSpreadsheetId, folderId] = ['1i6oBVl1BITLap9sXv2dMdFo2OM1luiR6ds6IpujoU1g', '1Arvl4vHaY67cGSH8uG4yhV9h4YKhCUdq'];
  //Function name self-explanatory
  let newSpreadsheet = createNewSpreadsheetFromTemplate(templateSpreadsheetId, submissionNameStem, folderId);
  //Use Utilities to decode file uploaded on frontend to blob
  let blob = decodeFileData(fileData, submissionNameStem);
  //Pass file blob to save file to appropriate folder in Drive
  let file = saveFileToDrive(blob, uuid, folderId);
  try {
    // Try to write data from form to various elements of spreadsheet
    // and if any exceptions, trash new spreadsheet and file and throw error
    mergeFormDataWithSheet(form, newSpreadsheet);
  } catch(error) {
    newSpreadsheet.setTrashed(true);
    file.setTrashed(true);
    throw error;
  }
}

function setSubmissionMetadata(form) {
  form.metadata = {
    uuid: Utilities.getUuid(),
    date: new Date(),
    get formattedDate() {
      return Utilities.formatDate(this.date, 'EST', 'YYYY-MM-dd')
    },
    get submissionNameStem() {
      return `${ this.formattedDate } ${ form.basic_information.name }`
    } 
  }
}

function decodeFileData(fileData, fileName) {
  //Source for decoding steps @https://www.labnol.org/code/19747-google-forms-upload-files
  let contentType = fileData.substring(5, fileData.indexOf(';')),
    bytes = Utilities.base64Decode(fileData.substr(fileData.indexOf('base64,') + 7)),
    blob = Utilities.newBlob(bytes, contentType,`${fileName} Receipts`);
  return blob;
}

function saveFileToDrive(blob, uuid, folderId) {
  try {
    return DriveApp.getFolderById(folderId).createFile(blob).setDescription(`Receipts for Report ID: ${uuid}`);
  } catch(error) {
    throw error;
  }
}

function createNewSpreadsheetFromTemplate(templateSpreadsheetId, fileName, folderId) {
  try {
    let folder = DriveApp.getFolderById(folderId);
    return DriveApp.getFileById(templateSpreadsheetId).makeCopy(`${fileName} Expense Report`,folder);
  } catch(error) {
    throw error;
  }
}

function mergeFormDataWithSheet(form, spreadsheet) {
  try {
    spreadsheet = SpreadsheetApp.open(spreadsheet);
    // Iterate form objects and map values to markers in template spreadsheet
    [form.metadata, form.basic_information].forEach( object => {
      Object.keys(object).map( key => {
        spreadsheet
          .createTextFinder(`<<${key}>>`)
          .replaceAllWith( object[key].toString().replace(/\r\n/g,'\n') );
      });
    });
    // Append itemized report table to appropriate sheet and return range
    // to use as source for pivot table summarizing expenses
    let itemizedReportTable = appendRowsToTableAndFormat( spreadsheet, spreadsheet.getSheetByName('Itemized Report'), 'ItemizedReportTable', form );
    addSummaryPivotTableToSheet( spreadsheet.getRangeByName('SummaryPivotTableAnchor'), itemizedReportTable );
  } catch(error) {
    throw error;
  }
}

function appendRowsToTableAndFormat(spreadsheet, sheet, headerRangeName, form) {
  try {
    let header = spreadsheet.getRangeByName(headerRangeName);
    sheet.insertRowsAfter( header.getRow(), form.expenses.length );
    let fullTable = sheet.getRange( header.getRow(), header.getColumn(), form.expenses.length + 1, header.getLastColumn() ),
      tableBody = fullTable.offset(1,0,form.expenses.length);
    // Write expenses array from form to table body and set formatting
    tableBody
      .setValues(form.expenses)
      .clearFormat()
      .setHorizontalAlignment('center')
      .setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
    // Format 'Amount' column of itemized report table to show appropriate currency symbol
    let expensesTotalRangeA1Notation = sheet
      .getRange(tableBody.getRow(), tableBody.getLastColumn(), tableBody.getNumRows() )
      .setNumberFormat( setCurrencyFormat(form.basic_information.report_currency) )
      .getA1Notation();
    // Write SUM formula to appropriate named range on itemized report sheet
    spreadsheet.getRangeByName('ExpensesTotal').setFormula(`=SUM(${expensesTotalRangeA1Notation})`);
    return fullTable;
  } catch(error) {
    throw error;
  }
}

function addSummaryPivotTableToSheet(pivotTableAnchor,dataSource) {
  try { 
    var pivotTable = pivotTableAnchor.createPivotTable(dataSource);
    pivotTable.addRowGroup(5);
    pivotTable.addRowGroup(6)
      .showTotals(false);
    pivotTable.addPivotValue(7, SpreadsheetApp.PivotTableSummarizeFunction.SUM)
    .setDisplayName('Amount');
  } catch(error) {
    throw error;
  }
}

function setCurrencyFormat(currencyCode) {
  try {
    var formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).formatToParts(),
      currencySymbol = formatter.find( element => element.type === 'currency' ).value,
      numberFormatString = `[$${currencySymbol}]#,##0.00`;
    return numberFormatString;
  } catch(error) {
    throw error;
  } 
}
