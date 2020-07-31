
/** rf-db-mailer
 * @desc
 * Fetch templates and translations from db, bulid and send mails.
 * Uses "mustache" to compile html.
 * into html and nodemailer for sending.
 * @author felix furtmayr, ff@rapidfacture.com, Rapidfacture GmbH
 * @license ISC
 */


const mustache = require('mustache');
const nodemailer = require('nodemailer');
const htmlToText = require('html-to-text');

let log = require('rf-log').customPrefixLogger('[rf-db-template-mailer]');



let opts = {}; // options passed when creating an instance
let db = {};
let translations = []; // json tranlation files
let mailtemplates = [];
let subjects = [];


/** create an instance
 *
 * @example
 * var mail = simpleTemplateMailer({
 *  defaultLanguage: 'en',
 *  transporter:  { // nodemailer tramporter options
 *     host: 'smtp.test.mail.address',
 *     requiresAuth: false,
 *  },
 *  translationsPath: __dirname +  "/translations",
 *  templatesPath: __dirname + "/templates",
 * });
 *
 */
module.exports = {
   start,
   reloadTemplates,
   getTemplate,
   send
};


function start (options, database) {
   options = options || {};
   db = database;

   // housekeeping
   if (!options.transporter) return log.error('no transporter defined, aborting');

   // options passed when creating an instance
   opts = {
      defaultLanguage: options.defaultLanguage || 'de',
      transporter: nodemailer.createTransport(options.transporter),
      translations: options.translations || {}
   };

   reloadTemplates();

   return module.exports;
}

function reloadTemplates () {
   // fetch from db
   getTranslations();
   getTemplates();
}


function getTranslations (callback) {
   db.global.translations
      .find({})
      .exec(function (err, translationsList) {
         if (err) {
            log.error(err);
            callback(err);
         } else {
            translationsList = translationsList || [];
            translationsList.forEach(function (translation) {
               translations[translation.lang] = translation.keys;
            });
         }
      });
}

function getTemplates (callback) {
   db.global.mailtemplates
      .find({type: 'email'})
      .exec(function (err, templates) {
         if (err) {
            log.error(err);
            callback(err);
         } else {
            templates = templates || [];
            templates.forEach(function (template) {
               mailtemplates[template.name] = template.text;
               subjects[template.name] = template.subject;
            });
         }
      });
}



function getTemplate (templateOps, callback) {

   // housekeeping
   if (!callback) {
      log.error('no callback defined');
      return log.error('no callback defined');
   }
   if (!templateOps) {
      log.error('no template defined');
      return callback('no template defined');
   }

   let lang = templateOps.language || opts.defaultLanguage || 'de';
   let translation = translations[lang];

   let tmplName = templateOps.name;
   let template = mailtemplates[tmplName];

   // get a valid language
   let langObj, message = {};
   if (lang && translation) {
      langObj = translation; // get choosen translation
   } else if (translations && opts.defaultLanguage) {
      log.info('no language found, switching to default');
      langObj = translations[opts.defaultLanguage];
   } else {
      log.info('no language defined');
   }

   // add language extensions
   // if (opts.translations[lang] && langObj) {
   //    for (var key in opts.translations[lang]) {
   //       langObj[key] = opts.translations[lang][key];
   //    }
   // }

   let compileData = {
      data: templateOps.data,
      lang: langObj,
      templates: mailtemplates
   };

   // compile subject with mustache
   if (subjects[tmplName]) {
      message.subject = mustache.render(subjects[tmplName], compileData); // json inserted in "{{ }}"

      // render twice: as the subject refernces to a translation which can also include translations/templates
      message.subject = mustache.render(message.subject, compileData);
   }

   // compile html message with mustache
   if (template) {
      message.html = mustache.render(template, compileData); // json inserted in "{{ }}"
   } else { // no template => return template subject
      message.html = message.subject;
   }

   // generate plain text from html
   if (!message.text && message.html) message.text = htmlToText.fromString(message.html, { wordwrap: 130 });

   callback(null, message);
}


function send (template, message, callback) {

   // housekeeping
   let errMsg = '';
   if (!template) errMsg = 'no template defined';
   if (!message || !message.to) errMsg = 'no template and no options defined for nodemailer';
   if (!callback) errMsg = 'no callback defined';
   if (errMsg) {
      log.error(errMsg);
      return callback(errMsg);
   }


   getTemplate(template, function (err, mailContent) {

      if (err) {
         log.error('error in getting template: ', err);
         return callback(err);
      }

      message.subject = message.subject || mailContent.subject;
      message.html = message.html || mailContent.html;
      message.text = message.text || mailContent.text;

      // send mail with nodemailer
      // options: https://nodemailer.com/message/
      opts.transporter.sendMail(message,
         function (err, info) {
            if (err) {
               log.error('error in sendMail: ', err);
            } else {
               log.success('successfull sent mail');
            }
            callback(err, info);
         });
   });
}
