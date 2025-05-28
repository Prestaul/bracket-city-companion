// Saves options to chrome.storage
const onSubmit = (e) => {
  e.preventDefault();

  const options = {
    showIds: showIdsInput.checked,
    showHighlights: showHighlightsInput.checked,
  };

  saveButton.disabled = true;

  chrome.storage.sync.set(
    { options },
    () => {
      // Update status to let user know options were saved.
      // const status = document.getElementById('status');
      statusOutput.textContent = 'Options saved.';
      setTimeout(() => {
        statusOutput.textContent = '';
        window.close();
      }, 750);
    }
  );
};

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
const restoreOptions = () => {
  chrome.storage.sync.get(
    'options',
    (data) => {
      showIdsInput.checked = data?.options?.showIds ?? true;
      showHighlightsInput.checked = data?.options?.showHighlights ?? true;
    }
  );
};

document.addEventListener('DOMContentLoaded', restoreOptions);
optionsForm.addEventListener('submit', onSubmit);
