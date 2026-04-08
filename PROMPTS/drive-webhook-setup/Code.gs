// HopeSpot Drive Integration — Google Apps Script Web App
// Deploy: script.google.com > New Project > Deploy > Web App
// Execute as: Me | Access: Anyone
// Copy the deployment URL and add to Railway as DRIVE_WEBHOOK_URL

const ROOT_FOLDER_NAME = 'Job Applications';
const BASE_RESUMES_FOLDER_NAME = 'Base Resumes';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const { folderName, variant, coverLetterText, company, role } = data;
    if (!folderName || !variant || !coverLetterText) {
      return respond({ ok: false, error: 'Missing required fields: folderName, variant, coverLetterText' });
    }

    // Find or create Job Applications root
    let rootFolder;
    const rootQuery = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
    rootFolder = rootQuery.hasNext() ? rootQuery.next() : DriveApp.createFolder(ROOT_FOLDER_NAME);

    // Create job folder (or reuse if exists)
    let jobFolder;
    const existingQuery = rootFolder.getFoldersByName(folderName);
    jobFolder = existingQuery.hasNext() ? existingQuery.next() : rootFolder.createFolder(folderName);

    // Copy resume PDF from Base Resumes/[Variant]/
    const baseQuery = rootFolder.getFoldersByName(BASE_RESUMES_FOLDER_NAME);
    if (baseQuery.hasNext()) {
      const baseFolder = baseQuery.next();
      const variantName = variant.charAt(0).toUpperCase() + variant.slice(1).toLowerCase();
      const variantQuery = baseFolder.getFoldersByName(variantName);
      if (variantQuery.hasNext()) {
        const variantFolder = variantQuery.next();
        const resumeQuery = variantFolder.getFilesByName('Everett Steele - Resume.pdf');
        if (resumeQuery.hasNext()) {
          resumeQuery.next().makeCopy('Everett Steele - Resume.pdf', jobFolder);
        }
      }
    }

    // Create cover letter as Google Doc
    const docTitle = (company || folderName) + ' - Cover Letter';
    const doc = DocumentApp.create(docTitle);
    const body = doc.getBody();
    body.clear();
    const header = body.appendParagraph('EVERETT STEELE');
    header.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    header.setAttributes({ [DocumentApp.Attribute.BOLD]: true, [DocumentApp.Attribute.FONT_SIZE]: 14 });
    const contact = body.appendParagraph('everett.steele@gmail.com  |  678.899.3971  |  linkedin.com/in/everettsteeleATL  |  Atlanta, GA');
    contact.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    body.appendParagraph('');
    coverLetterText.split('\n').filter(p => p.trim()).forEach(p => body.appendParagraph(p));
    doc.saveAndClose();
    const docFile = DriveApp.getFileById(doc.getId());
    jobFolder.addFile(docFile);
    DriveApp.getRootFolder().removeFile(docFile);

    return respond({ ok: true, folderUrl: jobFolder.getUrl(), folderId: jobFolder.getId() });
  } catch(err) {
    return respond({ ok: false, error: err.message });
  }
}

function doGet(e) {
  return respond({ ok: true, service: 'HopeSpot Drive', version: '1.0' });
}

function respond(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
