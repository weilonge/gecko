const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

Cu.import("resource://formautofill/FormAutofillParent.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://testing-common/ContentTaskUtils.jsm");

var gAutocompletePopup = Services.ww.activeWindow.
                                   document.
                                   getElementById("PopupAutoComplete");
assert.ok(gAutocompletePopup, "Got autocomplete popup");

var ParentUtils = {
  getMenuEntries() {
    let entries = [];
    let numRows = gAutocompletePopup.view.matchCount;
    for (let i = 0; i < numRows; i++) {
      entries.push(gAutocompletePopup.view.getValueAt(i));
    }
    return entries;
  },

  cleanUpProfile() {
    //TODO: Call profile storage clean up API
  },

  updateProfile(changes) {
    //TODO: Call profile storage update API
  },

  popupshownListener() {
    let results = this.getMenuEntries();
    sendAsyncMessage("onpopupshown", { results });
  },

  countEntries(name, value) {
    let obj = {};
    if (name)
      obj.fieldname = name;
    if (value)
      obj.value = value;

    let count = 0;
    let listener = {
      handleResult(result) { count = result },
      handleError(error) {
        assert.ok(false, error);
        sendAsyncMessage("entriesCounted", { ok: false });
      },
      handleCompletion(reason) {
        if (!reason) {
          sendAsyncMessage("entriesCounted", { ok: true, count });
        }
      }
    };

    //TODO: Call profile storage count API
  },

  checkRowCount(expectedCount, expectedFirstValue = null) {
    ContentTaskUtils.waitForCondition(() => {
      // This may be called before gAutocompletePopup has initialised
      // which causes it to throw
      try {
        return gAutocompletePopup.view.matchCount === expectedCount &&
          (!expectedFirstValue ||
           expectedCount <= 1 ||
           gAutocompletePopup.view.getValueAt(0) === expectedFirstValue);
      } catch (e) {
        return false;
      }
    }, "Waiting for row count change: " + expectedCount + " First value: " + expectedFirstValue).then(() => {
      let results = this.getMenuEntries();
      sendAsyncMessage("gotMenuChange", { results });
    });
  },

  checkSelectedIndex(expectedIndex) {
    ContentTaskUtils.waitForCondition(() => {
      return gAutocompletePopup.popupOpen &&
             gAutocompletePopup.selectedIndex === expectedIndex;
    }, "Checking selected index").then(() => {
      sendAsyncMessage("gotSelectedIndex");
    });
  },

  getPopupState() {
    sendAsyncMessage("gotPopupState", {
      open: gAutocompletePopup.popupOpen,
      selectedIndex: gAutocompletePopup.selectedIndex,
      direction: gAutocompletePopup.style.direction,
    });
  },

  observe(subject, topic, data) {
    assert.ok(topic === "satchel-storage-changed");
    sendAsyncMessage("satchel-storage-changed", { subject: null, topic, data });
  },

  cleanup() {
    gAutocompletePopup.removeEventListener("popupshown", this._popupshownListener);
    this.cleanUpProfile();
  }
};

ParentUtils._popupshownListener =
  ParentUtils.popupshownListener.bind(ParentUtils);
gAutocompletePopup.addEventListener("popupshown", ParentUtils._popupshownListener);
ParentUtils.cleanUpProfile();

addMessageListener("updateProfile", (msg) => {
  ParentUtils.updateProfile(msg.changes);
});

addMessageListener("countEntries", ({ name, value }) => {
  ParentUtils.countEntries(name, value);
});

addMessageListener("waitForMenuChange", ({ expectedCount, expectedFirstValue }) => {
  ParentUtils.checkRowCount(expectedCount, expectedFirstValue);
});

addMessageListener("waitForSelectedIndex", ({ expectedIndex }) => {
  ParentUtils.checkSelectedIndex(expectedIndex);
});

addMessageListener("getPopupState", () => {
  ParentUtils.getPopupState();
});

addMessageListener("addObserver", () => {
  Services.obs.addObserver(ParentUtils, "satchel-storage-changed", false);
});
addMessageListener("removeObserver", () => {
  Services.obs.removeObserver(ParentUtils, "satchel-storage-changed");
});

addMessageListener("cleanup", () => {
  ParentUtils.cleanup();
});
