/**
 * Tests ProfileStorage object with creditCards records.
 */

"use strict";

const {ProfileStorage} = Cu.import("resource://formautofill/ProfileStorage.jsm", {});

const TEST_STORE_FILE_NAME = "test-credit-card.json";

const TEST_CREDIT_CARD_1 = {
  "cc-name": "John Doe",
  "cc-number": "1234567812345678",
  "cc-exp-month": 4,
  "cc-exp-year": 2017,
};

const TEST_CREDIT_CARD_2 = {
  "cc-name": "Timothy Berners-Lee",
  "cc-number": "1111222233334444",
  "cc-exp-month": 12,
  "cc-exp-year": 2022,
};

const TEST_CREDIT_CARD_3 = {
  "cc-number": "9999888877776666",
  "cc-exp-month": 1,
  "cc-exp-year": 2000,
};

const TEST_CREDIT_CARD_WITH_2_DIGITS_YEAR = {
  "cc-number": "1234123412341234",
  "cc-exp-month": 1,
  "cc-exp-year": 12,
};

const TEST_CREDIT_CARD_WITH_INVALID_FIELD = {
  "cc-name": "John Doe",
  invalidField: "INVALID",
};

const TEST_CREDIT_CARD_WITH_INVALID_EXPIRY_DATE = {
  "cc-name": "John Doe",
  "cc-number": "1111222233334444",
  "cc-exp-month": 13,
  "cc-exp-year": -3,
};

const TEST_CREDIT_CARD_WITH_SPACES_BETWEEN_DIGITS = {
  "cc-name": "John Doe",
  "cc-number": "1111 2222 3333 4444",
};

const TEST_CREDIT_CARD_WITH_INVALID_NUMBERS = {
  "cc-name": "John Doe",
  "cc-number": "abcdefg",
};

let prepareTestCreditCards = async function(path) {
  let profileStorage = new ProfileStorage(path);
  await profileStorage.initialize();

  let onChanged = TestUtils.topicObserved("formautofill-storage-changed",
                                          (subject, data) => data == "add");
  do_check_true(profileStorage.creditCards.add(TEST_CREDIT_CARD_1));
  await onChanged;
  do_check_true(profileStorage.creditCards.add(TEST_CREDIT_CARD_2));
  await profileStorage._saveImmediately();
};

let reCCNumber = /^(\*+)(.{4})$/;

let do_check_credit_card_matches = (creditCardWithMeta, creditCard) => {
  for (let key in creditCard) {
    if (key == "cc-number") {
      do_check_eq(creditCardWithMeta["cc-number"], undefined);

      // check "cc-number-encrypted" after encryption lands (bug 1337314).

      let matches = reCCNumber.exec(creditCardWithMeta["cc-number-masked"]);
      do_check_neq(matches, null);
      do_check_eq(creditCardWithMeta["cc-number-masked"].length, creditCard["cc-number"].length);
      do_check_eq(creditCard["cc-number"].endsWith(matches[2]), true);
    } else {
      do_check_eq(creditCardWithMeta[key], creditCard[key]);
    }
  }
};

add_task(async function test_initialize() {
  let path = getTempFile(TEST_STORE_FILE_NAME).path;
  let profileStorage = new ProfileStorage(path);
  await profileStorage.initialize();

  do_check_eq(profileStorage._store.data.version, 1);
  do_check_eq(profileStorage._store.data.creditCards.length, 0);

  let data = profileStorage._store.data;
  Assert.deepEqual(data.creditCards, []);

  await profileStorage._saveImmediately();

  profileStorage = new ProfileStorage(path);
  await profileStorage.initialize();

  Assert.deepEqual(profileStorage._store.data, data);
});

add_task(async function test_getAll() {
  let path = getTempFile(TEST_STORE_FILE_NAME).path;
  await prepareTestCreditCards(path);

  let profileStorage = new ProfileStorage(path);
  await profileStorage.initialize();

  let creditCards = profileStorage.creditCards.getAll();

  do_check_eq(creditCards.length, 2);
  do_check_credit_card_matches(creditCards[0], TEST_CREDIT_CARD_1);
  do_check_credit_card_matches(creditCards[1], TEST_CREDIT_CARD_2);

  // Check computed fields.
  do_check_eq(creditCards[0]["cc-given-name"], "John");
  do_check_eq(creditCards[0]["cc-family-name"], "Doe");

  // Test with noComputedFields set.
  creditCards = profileStorage.creditCards.getAll({noComputedFields: true});
  do_check_eq(creditCards[0]["cc-given-name"], undefined);
  do_check_eq(creditCards[0]["cc-family-name"], undefined);

  // Modifying output shouldn't affect the storage.
  creditCards[0]["cc-name"] = "test";
  do_check_credit_card_matches(profileStorage.creditCards.getAll()[0], TEST_CREDIT_CARD_1);
});

add_task(async function test_get() {
  let path = getTempFile(TEST_STORE_FILE_NAME).path;
  await prepareTestCreditCards(path);

  let profileStorage = new ProfileStorage(path);
  await profileStorage.initialize();

  let creditCards = profileStorage.creditCards.getAll();
  let guid = creditCards[0].guid;

  let creditCard = profileStorage.creditCards.get(guid);
  do_check_credit_card_matches(creditCard, TEST_CREDIT_CARD_1);

  // Modifying output shouldn't affect the storage.
  creditCards[0]["cc-name"] = "test";
  do_check_credit_card_matches(profileStorage.creditCards.get(guid), TEST_CREDIT_CARD_1);

  do_check_eq(profileStorage.creditCards.get("INVALID_GUID"), null);
});

add_task(async function test_getByFilter() {
  let path = getTempFile(TEST_STORE_FILE_NAME).path;
  await prepareTestCreditCards(path);

  let profileStorage = new ProfileStorage(path);
  await profileStorage.initialize();

  let filter = {info: {fieldName: "cc-name"}, searchString: "Tim"};
  let creditCards = profileStorage.creditCards.getByFilter(filter);
  do_check_eq(creditCards.length, 1);
  do_check_credit_card_matches(creditCards[0], TEST_CREDIT_CARD_2);

  // TODO: Uncomment this after decryption lands (bug 1337314).
  // filter = {info: {fieldName: "cc-number"}, searchString: "11"};
  // creditCards = profileStorage.creditCards.getByFilter(filter);
  // do_check_eq(creditCards.length, 1);
  // do_check_credit_card_matches(creditCards[0], TEST_CREDIT_CARD_2);
});

add_task(async function test_add() {
  let path = getTempFile(TEST_STORE_FILE_NAME).path;
  await prepareTestCreditCards(path);

  let profileStorage = new ProfileStorage(path);
  await profileStorage.initialize();

  let creditCards = profileStorage.creditCards.getAll();

  do_check_eq(creditCards.length, 2);

  do_check_credit_card_matches(creditCards[0], TEST_CREDIT_CARD_1);
  do_check_credit_card_matches(creditCards[1], TEST_CREDIT_CARD_2);

  do_check_neq(creditCards[0].guid, undefined);
  do_check_eq(creditCards[0].version, 1);
  do_check_neq(creditCards[0].timeCreated, undefined);
  do_check_eq(creditCards[0].timeLastModified, creditCards[0].timeCreated);
  do_check_eq(creditCards[0].timeLastUsed, 0);
  do_check_eq(creditCards[0].timesUsed, 0);

  Assert.throws(() => profileStorage.creditCards.add(TEST_CREDIT_CARD_WITH_INVALID_FIELD),
    /"invalidField" is not a valid field\./);
});

add_task(async function test_update() {
  let path = getTempFile(TEST_STORE_FILE_NAME).path;
  await prepareTestCreditCards(path);

  let profileStorage = new ProfileStorage(path);
  await profileStorage.initialize();

  let creditCards = profileStorage.creditCards.getAll();
  let guid = creditCards[1].guid;
  let timeLastModified = creditCards[1].timeLastModified;

  let onChanged = TestUtils.topicObserved("formautofill-storage-changed",
                                          (subject, data) => data == "update");

  do_check_neq(creditCards[1]["cc-name"], undefined);

  profileStorage.creditCards.update(guid, TEST_CREDIT_CARD_3);
  await onChanged;
  await profileStorage._saveImmediately();

  profileStorage = new ProfileStorage(path);
  await profileStorage.initialize();

  let creditCard = profileStorage.creditCards.get(guid);

  do_check_eq(creditCard["cc-name"], undefined);
  do_check_neq(creditCard.timeLastModified, timeLastModified);
  do_check_credit_card_matches(creditCard, TEST_CREDIT_CARD_3);

  Assert.throws(
    () => profileStorage.creditCards.update("INVALID_GUID", TEST_CREDIT_CARD_3),
    /No matching record\./
  );

  Assert.throws(
    () => profileStorage.creditCards.update(guid, TEST_CREDIT_CARD_WITH_INVALID_FIELD),
    /"invalidField" is not a valid field\./
  );
});

add_task(async function test_findCommonFieldsBySchemaVersion() {
  let path = getTempFile(TEST_STORE_FILE_NAME).path;
  let profileStorage = new ProfileStorage(path);
  await profileStorage.initialize();
  let creditCards = profileStorage.creditCards;

  const ITEM_1 = Object.assign({
    "guid": "DUMMY_1",
    "version": 1,
    "timeCreated": 0,
    "timeLastUsed": 0,
    "timeLastModified": 0,
    "timesUsed": 0,
  }, TEST_CREDIT_CARD_1);

  const ITEM_2 = Object.assign({
    "guid": "DUMMY_2",
    "version": 6000,
    "newUnknownField": "test new field",
    "timeCreated": 5000,
    "timeLastUsed": 6000,
    "timeLastModified": 7000,
    "timesUsed": 10,
  }, TEST_CREDIT_CARD_1);

  Assert.deepEqual(creditCards.VALID_FIELDS,
                   creditCards._findCommonFieldsBySchemaVersion(ITEM_1.version,
                                                                ITEM_2.version));

  const ITEM_3 = Object.assign({
    "guid": "DUMMY_3",
    "version": 6001,
    "newUnknownField": "test new field",
    "anotherNewUnknownField": "test another new field",
    "timeCreated": 5000,
    "timeLastUsed": 6000,
    "timeLastModified": 7000,
    "timesUsed": 10,
  }, TEST_CREDIT_CARD_1);

  Assert.equal(null, creditCards._findCommonFieldsBySchemaVersion(ITEM_2.version,
                                                                  ITEM_3.version));
});

add_task(async function test_isRawIdentical() {
  let path = getTempFile(TEST_STORE_FILE_NAME).path;
  let profileStorage = new ProfileStorage(path);
  await profileStorage.initialize();

  const ITEM_1 = Object.assign({
    "guid": "DUMMY_1",
    "version": 1,
    "timeCreated": 0,
    "timeLastUsed": 0,
    "timeLastModified": 0,
    "timesUsed": 0,
  }, TEST_CREDIT_CARD_1);

  const ITEM_2 = Object.assign({
    "guid": "DUMMY_2",
    "version": 1,
    "timeCreated": 50,
    "timeLastUsed": 60,
    "timeLastModified": 70,
    "timesUsed": 80,
  }, TEST_CREDIT_CARD_1);

  Assert.equal(profileStorage.creditCards._isRawIdentical(ITEM_1, ITEM_2), true);

  const ITEM_2_modified_ccName = Object.assign({}, ITEM_2, {
    "cc-name": "DUMMY",
  });

  Assert.equal(profileStorage.creditCards._isRawIdentical(ITEM_1, ITEM_2_modified_ccName), false);

  const ITEM_3 = Object.assign({
    "guid": "DUMMY_3",
    "version": 6000,
    "newUnknownField": "test new field",
    "timeCreated": 5000,
    "timeLastUsed": 6000,
    "timeLastModified": 7000,
    "timesUsed": 10,
  }, TEST_CREDIT_CARD_1);

  Assert.equal(profileStorage.creditCards._isRawIdentical(ITEM_1, ITEM_3), true);

  const ITEM_4 = Object.assign({
    "guid": "DUMMY_4",
    "version": 6001,
    "newUnknownField": "test new field",
    "anotherNewUnknownField": "test another new field",
    "timeCreated": 5000,
    "timeLastUsed": 6000,
    "timeLastModified": 7000,
    "timesUsed": 10,
  }, TEST_CREDIT_CARD_1);

  Assert.equal(profileStorage.creditCards._isRawIdentical(ITEM_3, ITEM_4), false);
});

add_task(async function test_migrate() {
  let path = getTempFile(TEST_STORE_FILE_NAME).path;
  let profileStorage = new ProfileStorage(path);
  await profileStorage.initialize();
  let creditCards = profileStorage.creditCards;

  const ITEM_1 = Object.assign({
    "guid": "DUMMY_1",
    "version": 1,
    "timeCreated": 0,
    "timeLastUsed": 0,
    "timeLastModified": 0,
    "timesUsed": 0,
  }, TEST_CREDIT_CARD_1);

  Assert.deepEqual(creditCards._migrate(ITEM_1), ITEM_1);

  const ITEM_2 = Object.assign({
    "guid": "DUMMY_2",
    "version": 6000,
    "newUnknownField": "test new field",
    "timeCreated": 5000,
    "timeLastUsed": 6000,
    "timeLastModified": 7000,
    "timesUsed": 10,
  }, TEST_CREDIT_CARD_1);

  Assert.deepEqual(creditCards._migrate(ITEM_2), ITEM_2);

  const ITEM_3 = Object.assign({
    "guid": "DUMMY_3",
    "version": "BAD version",
    "newUnknownField": "test new field",
    "anotherNewUnknownField": "test another new field",
    "timeCreated": 5000,
    "timeLastUsed": 6000,
    "timeLastModified": 7000,
    "timesUsed": 10,
  }, TEST_CREDIT_CARD_1);

  Assert.deepEqual(creditCards._migrate(ITEM_3), null);

  const ITEM_4 = Object.assign({
    "guid": "DUMMY_4",
    "version": 0,
    "timeCreated": 5000,
    "timeLastUsed": 6000,
    "timeLastModified": 7000,
    "timesUsed": 10,
  }, TEST_CREDIT_CARD_1);

  Assert.deepEqual(creditCards._migrate(ITEM_4), null);
});

add_task(async function test_mergeRawRecords() {
  let path = getTempFile(TEST_STORE_FILE_NAME).path;
  let profileStorage = new ProfileStorage(path);
  await profileStorage.initialize();
  let creditCards = profileStorage.creditCards;

  const ITEM_1 = Object.assign({
    "guid": "DUMMY_1",
    "version": 1,
    "timeCreated": 50,
    "timeLastUsed": 60,
    "timeLastModified": 70,
    "timesUsed": 1000,
  }, TEST_CREDIT_CARD_1);

  const ITEM_2 = Object.assign({
    "guid": "DUMMY_2",
    "version": 6000,
    "newUnknownField": "test new field",
    "timeCreated": 5000,
    "timeLastUsed": 6000,
    "timeLastModified": 7000,
    "timesUsed": 10,
  }, TEST_CREDIT_CARD_1);

  Assert.deepEqual(creditCards._mergeRawRecords(ITEM_1, ITEM_2),
                   Object.assign({}, ITEM_2, {
                     "timeCreated": 5000,
                     "timeLastUsed": 6000,
                     "timeLastModified": 7000,
                     "timesUsed": 1000,
                   }));

  const ITEM_3 = Object.assign({
    "guid": "DUMMY_3",
    "version": 1,
    "timeCreated": 5000,
    "timeLastUsed": 6000,
    "timeLastModified": 7000,
    "timesUsed": 10,
  }, TEST_CREDIT_CARD_1);

  Assert.deepEqual(creditCards._mergeRawRecords(ITEM_1, ITEM_3),
                   Object.assign({}, ITEM_3, {
                     "timeCreated": 5000,
                     "timeLastUsed": 6000,
                     "timeLastModified": 7000,
                     "timesUsed": 1000,
                   }));

  const ITEM_4 = Object.assign({
    "guid": "DUMMY_1",
    "version": 1,
    "timeCreated": 5000,
    "timeLastUsed": 6000,
    "timeLastModified": 7000,
    "timesUsed": 10,
  }, TEST_CREDIT_CARD_1);

  Assert.deepEqual(creditCards._mergeRawRecords(ITEM_1, ITEM_4),
                   Object.assign({}, ITEM_4, {
                     "timeCreated": 5000,
                     "timeLastUsed": 6000,
                     "timeLastModified": 7000,
                     "timesUsed": 1010,
                   }));
});

add_task(async function test_prefer() {
  let path = getTempFile(TEST_STORE_FILE_NAME).path;
  let profileStorage = new ProfileStorage(path);
  await profileStorage.initialize();

  const ITEM_1 = Object.assign({
    "guid": "DUMMY_1",
    "version": 1,
    "timeCreated": 5000,
    "timeLastUsed": 6000,
    "timeLastModified": 7000,
    "timesUsed": 8000,
  }, TEST_CREDIT_CARD_1, {
    "cc-name": "foo",
  });

  const ITEM_2 = Object.assign({
    "guid": "DUMMY_2",
    "version": 6000,
    "newUnknownField": "test new field",
    "timeCreated": 0,
    "timeLastUsed": 0,
    "timeLastModified": 0,
    "timesUsed": 0,
  }, TEST_CREDIT_CARD_1);

  Assert.deepEqual(profileStorage.creditCards.prefer(ITEM_1, ITEM_2), null);

  const ITEM_3 = Object.assign({
    "guid": "DUMMY_3",
    "version": 1,
    "timeCreated": 0,
    "timeLastUsed": 0,
    "timeLastModified": 0,
    "timesUsed": 0,
  }, TEST_CREDIT_CARD_1, {
    "cc-name": "another foo",
  });

  Assert.deepEqual(profileStorage.creditCards.prefer(ITEM_1, ITEM_3), null);

  const ITEM_4 = Object.assign({
    "guid": "DUMMY_4",
    "version": 1,
    "timeCreated": 2000,
    "timeLastUsed": 3000,
    "timeLastModified": 4000,
    "timesUsed": 5000,
  }, TEST_CREDIT_CARD_1, {
    "cc-name": "foo",
  });

  Assert.deepEqual(profileStorage.creditCards.prefer(ITEM_1, ITEM_4),
                   Object.assign({}, ITEM_4, {
                     "timeCreated": 5000,
                     "timeLastUsed": 6000,
                     "timeLastModified": 7000,
                     "timesUsed": 8000,
                   }));

  const ITEM_5 = Object.assign({
    "guid": "DUMMY_5",
    "version": 6001,
    "newUnknownField": "test new field",
    "anotherNewUnknownField": "test another new field",
    "timeCreated": 0,
    "timeLastUsed": 0,
    "timeLastModified": 0,
    "timesUsed": 0,
  }, TEST_CREDIT_CARD_1);

  Assert.deepEqual(profileStorage.creditCards.prefer(ITEM_2, ITEM_5), null);

  Assert.deepEqual(profileStorage.creditCards.prefer({
    guid: "DUMMY_1",
    deleted: true,
  }, ITEM_1), ITEM_1);

  Assert.deepEqual(profileStorage.creditCards.prefer(ITEM_1, {
    guid: "DUMMY_1",
    deleted: true,
  }), ITEM_1);

  Assert.deepEqual(profileStorage.creditCards.prefer({
    guid: "DUMMY_1",
    deleted: true,
  }, {
    guid: "DUMMY_1000",
    deleted: true,
  }), null);
});

add_task(async function test_validate() {
  let path = getTempFile(TEST_STORE_FILE_NAME).path;

  let profileStorage = new ProfileStorage(path);
  await profileStorage.initialize();

  profileStorage.creditCards.add(TEST_CREDIT_CARD_WITH_INVALID_EXPIRY_DATE);
  profileStorage.creditCards.add(TEST_CREDIT_CARD_WITH_2_DIGITS_YEAR);
  profileStorage.creditCards.add(TEST_CREDIT_CARD_WITH_SPACES_BETWEEN_DIGITS);

  let creditCards = profileStorage.creditCards.getAll();

  do_check_eq(creditCards[0]["cc-exp-month"], undefined);
  do_check_eq(creditCards[0]["cc-exp-year"], undefined);

  do_check_eq(creditCards[1]["cc-exp-month"], TEST_CREDIT_CARD_WITH_2_DIGITS_YEAR["cc-exp-month"]);
  do_check_eq(creditCards[1]["cc-exp-year"],
    parseInt(TEST_CREDIT_CARD_WITH_2_DIGITS_YEAR["cc-exp-year"], 10) + 2000);

  do_check_eq(creditCards[2]["cc-number-masked"].length, 16);
  // TODO: Check the decrypted numbers should not contain spaces after
  //       decryption lands (bug 1337314).

  Assert.throws(() => profileStorage.creditCards.add(TEST_CREDIT_CARD_WITH_INVALID_NUMBERS),
    /Credit card number contains invalid characters\./);
});

add_task(async function test_notifyUsed() {
  let path = getTempFile(TEST_STORE_FILE_NAME).path;
  await prepareTestCreditCards(path);

  let profileStorage = new ProfileStorage(path);
  await profileStorage.initialize();

  let creditCards = profileStorage.creditCards.getAll();
  let guid = creditCards[1].guid;
  let timeLastUsed = creditCards[1].timeLastUsed;
  let timesUsed = creditCards[1].timesUsed;

  let onChanged = TestUtils.topicObserved("formautofill-storage-changed",
                                          (subject, data) => data == "notifyUsed");

  profileStorage.creditCards.notifyUsed(guid);
  await onChanged;
  await profileStorage._saveImmediately();

  profileStorage = new ProfileStorage(path);
  await profileStorage.initialize();

  let creditCard = profileStorage.creditCards.get(guid);

  do_check_eq(creditCard.timesUsed, timesUsed + 1);
  do_check_neq(creditCard.timeLastUsed, timeLastUsed);

  Assert.throws(() => profileStorage.creditCards.notifyUsed("INVALID_GUID"),
    /No matching record\./);
});

add_task(async function test_remove() {
  let path = getTempFile(TEST_STORE_FILE_NAME).path;
  await prepareTestCreditCards(path);

  let profileStorage = new ProfileStorage(path);
  await profileStorage.initialize();

  let creditCards = profileStorage.creditCards.getAll();
  let guid = creditCards[1].guid;

  let onChanged = TestUtils.topicObserved("formautofill-storage-changed",
                                          (subject, data) => data == "remove");

  do_check_eq(creditCards.length, 2);

  profileStorage.creditCards.remove(guid);
  await onChanged;
  await profileStorage._saveImmediately();

  profileStorage = new ProfileStorage(path);
  await profileStorage.initialize();

  creditCards = profileStorage.creditCards.getAll();

  do_check_eq(creditCards.length, 1);

  do_check_eq(profileStorage.creditCards.get(guid), null);
});
