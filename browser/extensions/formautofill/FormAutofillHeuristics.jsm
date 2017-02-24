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

/**
 * Returns the autocomplete information of fields according to heuristics.
 */
this.FormAutofillHeuristics = {
  VALID_FIELDS: [
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

  getInfo(element) {
    if (!(element instanceof Ci.nsIDOMHTMLInputElement)) {
      return null;
    }

    let info = element.getAutocompleteInfo();
    if (info && info.fieldName &&
        this.VALID_FIELDS.includes(info.fieldName)) {
      return info;
    }

    let label = FormAutofillUtils.findLabelElement(element);
    if (!label) {
      return null;
    }
    for (let fieldName in this.VALID_LABELS) {
      if (this.VALID_LABELS[fieldName].test(label.textContent)) {
        return {
          fieldName,
          section: null,
          addressType: null,
          contactType: null,
        };
      }
    }

    return null;
  },
};
