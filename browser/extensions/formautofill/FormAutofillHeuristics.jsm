/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Form Autofill field heuristics.
 */

"use strict";

this.EXPORTED_SYMBOLS = ["FormAutofillHeuristics"];

const {classes: Cc, interfaces: Ci, utils: Cu, results: Cr} = Components;

Cu.import("resource://formautofill/FormAutofillUtils.jsm");

this.log = null;
FormAutofillUtils.defineLazyLogGetter(this, this.EXPORTED_SYMBOLS[0]);

/**
 * Returns the autocomplete information of fields according to heuristics.
 */
this.FormAutofillHeuristics = {
  VALID_FIELDS: [
    "given-name",
    "family-name",
    "organization",
    "street-address",
    "address-level2",
    "address-level1",
    "postal-code",
    "country",
    "tel",
    "email",
  ],

  VALID_LABELS: {
    "given-name": new RegExp(
      "first.*name|initials|fname|first$|given.*name" +
      "|vorname" +                // de-DE
      "|nombre" +                 // es
      "|forename|prénom|prenom" + // fr-FR
      "|名" +                     // ja-JP
      "|nome" +                   // pt-BR, pt-PT
      "|Имя" +                    // ru
      "|이름",                    // ko-KR
      "i"
    ),
    "family-name": new RegExp(
      "last.*name|lname|surname|last$|secondname|family.*name" +
      "|nachname" +                           // de-DE
      "|apellido" +                           // es
      "|famille|^nom" +                       // fr-FR
      "|cognome" +                            // it-IT
      "|姓" +                                 // ja-JP
      "|morada|apelidos|surename|sobrenome" + // pt-BR, pt-PT
      "|Фамилия" +                            // ru
      "|\\b성(?:[^명]|\\b)",                  // ko-KR
      "i"
    ),
    "organization": new RegExp(
      "company|busmness|organization|organisation" +
      "|firma|firmenname" +   // de-DE
      "|empresa" +            // es
      "|societe|société" +    // fr-FR
      "|ragione.?sociale" +   // it-IT
      "|会社" +               // ja-JP
      "|название.?компании" + // ru
      "|單位|公司" +          // zh-TW
      "|单位" +               // zh-CN
      "|회사|직장",           // ko-KR
      "i"
    ),
    "street-address": new RegExp(
      "streetaddress|street-address",
      "i"
    ),
    "address-level2": new RegExp(
      "addresslevel2|address-level2",
      "i"
    ),
    "address-level1": new RegExp(
      "addresslevel1|address-level1",
      "i"
    ),
    "postal-code": new RegExp(
      "zip|postal|post.*code|pcode" +
      "|pin.?code" +               // en-IN
      "|postleitzahl" +            // de-DE
      "|\\bcp\\b" +                // es
      "|\\bcdp\\b" +               // fr-FR
      "|\\bcap\\b" +               // it-IT
      "|郵便番号" +                // ja-JP
      "|codigo|codpos|\\bcep\\b" + // pt-BR, pt-PT
      "|Почтовый.?Индекс" +        // ru
      "|邮政编码|邮编" +           // zh-CN
      "|郵遞區號" +                // zh-TW
      "|우편.?번호",               // ko-KR
      "i"
    ),
    "country": new RegExp(
      "country|countries" +
      "|país|pais" + // es
      "|国" +        // ja-JP
      "|國家" +      // zh-TW
      "|国家" +      // zh-CN
      "|국가|나라",  // ko-KR
      "i"
    ),
    "tel": new RegExp(
      "phone|mobile|contact.?number" +
      "|telefonnummer" +                             // de-DE
      "|telefono|teléfono" +                         // es
      "|telfixe" +                                   // fr-FR
      "|電話" +                                      // ja-JP
      "|telefone|telemovel" +                        // pt-BR, pt-PT
      "|телефон" +                                   // ru
      "|電話" +                                      // zh-TW
      "|电话" +                                      // zh-CN
      "|(?:전화|핸드폰|휴대폰|휴대전화)(?:.?번호)?", // ko-KR
      "i"
    ),
    "email": new RegExp(
      "e.?mail" +
      "|courriel" +                                 // fr
      "|メールアドレス" +                           // ja-JP
      "|Электронной.?Почты" +                       // ru
      "|邮件|邮箱" +                                // zh-CN
      "|電郵地址|電子郵件" +                        // zh-TW
      "|(?:이메일|전자.?우편|[Ee]-?mail)(.?주소)?", // ko-KR
      "i"
    ),
  },

  getFormInfo(form) {
    let fieldDetails = [];
    for (let element of form.elements) {
      // Exclude elements to which no autocomplete field has been assigned.
      let info = this.getInfo(element);
      if (!info) {
        continue;
      }

      // Store the association between the field metadata and the element.
      if (fieldDetails.some(f => f.section == info.section &&
                                 f.addressType == info.addressType &&
                                 f.contactType == info.contactType &&
                                 f.fieldName == info.fieldName)) {
        // A field with the same identifier already exists.
        log.debug("Not collecting a field matching another with the same info:", info);
        continue;
      }

      let formatWithElement = {
        section: info.section,
        addressType: info.addressType,
        contactType: info.contactType,
        fieldName: info.fieldName,
        element, // TODO: Apply Cu.getWeakReference and use get API for strong ref.
      };

      fieldDetails.push(formatWithElement);
    }

    return fieldDetails;
  },

  getInfo(element) {
    if (!(element instanceof Ci.nsIDOMHTMLInputElement)) {
      return null;
    }

    let info = element.getAutocompleteInfo();
    if (info && info.fieldName &&
        this.VALID_FIELDS.includes(info.fieldName)) {
      return info;
    }

    let labels = FormAutofillUtils.findLabelElements(element);
    if (!labels || labels.length == 0) {
      log.debug("No label found for", element);
      return null;
    }
    for (let fieldName in this.VALID_LABELS) {
      for (let label of labels) {
        if (this.VALID_LABELS[fieldName].test(label.textContent)) {
          log.debug("found fieldName", fieldName);
          return {
            fieldName,
            section: "",
            addressType: "",
            contactType: "",
          };
        }
      }
    }

    return null;
  },
};
