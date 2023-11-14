let relayClient = undefined;

const ROLL_OUTCOME = {
  CRITICAL_SUCCESS: ['Critical Success', '#469B48'],
  MESSY_CRITICAL: ['Messy Critical', '#2E4B36'],
  SUCCESS: ['Success', '#026202'],
  FAILURE: ['Failure', 'red'],
  BESTIAL_FAILURE: ['Bestial Failure', 'darkred']
};

function generateRandomHash() {
  const uuidv4 = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  const id1 = uuidv4().replace(/-/g, '');
  const id2 = Date.now().toString(16);
  const id3 = Math.floor(Math.random() * 1000000000).toString(16);
  const hash = `${id3}${id1}${id2}`;
  return hash.split('').sort(() => Math.random() - 0.5).join('');
}

Hooks.once('init', async function() {
  game.settings.register('vicartt', 'isIntegrationEnabled', {
    name: 'Enable Integration',
    hint: 'Enable the VicarTT integration',
    scope: 'client',
    config: true,
    type: Boolean,
    default: false,
    onChange: value => {
      console.log('VicarTT: Integration enabled: ', value);
      if (value) {
        console.log('VicarTT: Connecting to VicarTT...');
        const defaultUrl = localStorage.getItem('vicartt-url') || 'https://vicar.nauri.io';
        const defaultHash = localStorage.getItem('vicartt-hash') || generateRandomHash();

        const dialog = new Dialog({
          title: 'VicarTT Integration',
          content: `<p>Enter the URL for your VicarTT instance and copy&paste the FoundryVTT VicarTT ID into Vicar.</p><p>URL: <input id="vicartt-url" type="text" value="${defaultUrl}"/></p><p>FoundryVTT VicarTT ID: <input id="vicartt-hash" type="text" value="${defaultHash}"/></p>`,
          buttons: {
            ok: {
              icon: '<i class="fas fa-check"></i>',
              label: 'OK',
              callback: () => {
                const url = document.getElementById('vicartt-url').value;
                const hash = document.getElementById('vicartt-hash').value;
                localStorage.setItem('vicartt-url', url);
                localStorage.setItem('vicartt-hash', hash);
                relayClient = new RelayClient();
                relayClient.connect();
              }
            },
            cancel: {
              icon: '<i class="fas fa-times"></i>',
              label: 'Cancel'
            }
          }
        });
        dialog.render(true);
      } else {
        if (relayClient) {
          relayClient.stop();
          relayClient = undefined;
        }
      }
    }
  });

  const isIntegrationEnabled = game.settings.get('vicartt', 'isIntegrationEnabled');
  if (isIntegrationEnabled) {
    console.log('VicarTT: Connecting to VicarTT...');
    relayClient = new RelayClient();
    relayClient.connect();
  }
});

class RelayClient {
  constructor() {
    this._stopped = false;
    this._url = localStorage.getItem('vicartt-url');
    this._hash = localStorage.getItem('vicartt-hash');
    this._source = undefined;
    this._sourceReconnectController = undefined;

    if (this._url.endsWith('/')) {
      this._url = this._url.slice(0, -1);
    }
  }

  connect() {
    if (this._sourceReconnectController) {
      clearInterval(this._sourceReconnectController);
    }

    if (this._stopped) {
      return;
    }

    this._source = new EventSource(`${this._url}/vicartt/stream?accessKey=${this._hash}`);
    this._source.onmessage = this.#onMessage.bind(this);
    this._source.onerror = this.#onError.bind(this);
    this._sourceReconnectController = setInterval(this.#checkConnection.bind(this), 5000);
  }

  stop() {
    this._stopped = true;
    this._source.close();
    clearInterval(this._sourceReconnectController);
  }

  #onMessage(event) {
    const data = JSON.parse(event.data);
    VampiricDiceRoller.roll(data);
  }

  #onError(event) {
    console.warn('VicarTT: Connection error: ', event);
  }

  #checkConnection() {
    if (this._source.readyState === 2) {
      this.connect();
    }
  }
}

class VampiricDiceRoller {
  static async roll(data) {
    const roll = new Roll(this.#formatRollText(data.roll));
    await roll.evaluate({
      async: true
    });

    const msg = await roll.toMessage();
    const html = await msg.getHTML();
    const messageElement = html.get(0);
    const messageContent = messageElement.querySelector('div.message-content');

    let usernameElement = ``;
    if (data.username && data.username !== '') {
      usernameElement = `<i style="font-size: 0.8rem">${data.username}</i>`;
    }

    if (data.vampire.avatar && data.vampire.avatar !== '') {
      messageContent.innerHTML = `<div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; margin-top: 0.3rem"><img src="${data.vampire.avatar}" style="width: 3rem; height: 3rem"><div style="display: flex; flex-direction: column; align-items: center; justify-content: flex-start"><span style="font-size: 1.1rem; font-weight: bold; width: 100%; text-align: left">${data.vampire.name}</span>${usernameElement}</div></div>` + messageContent.innerHTML;
    } else {
      messageContent.innerHTML = `<div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; margin-top: 0.3rem"><div style="display: flex; flex-direction: column; align-items: center; justify-content: flex-start"><span style="font-size: 1.1rem; font-weight: bold; width: 100%; text-align: left">${data.vampire.name}</span>${usernameElement}</div></div>` + messageContent.innerHTML;
    }

    const formulaElement = messageContent.querySelector('div.dice-formula');
    const formulaParts = [];
    if (data.roll.normalDices > 0) {
      formulaParts.push(`${data.roll.normalDices} normal dice`);
    }
    if (data.roll.hungerDices > 0) {
      formulaParts.push(`${data.roll.hungerDices} hunger dice`);
    }

    formulaElement.innerHTML = formulaParts.join(' + ');

    let totalSuccesses = 0;
    let totalCriticals = 0;
    let totalFailures = 0;
    let hungerCriticals = 0;
    let hungerFailures = 0;

    const handleDicePart = (section) => {
      const formula = section.querySelector('span.part-formula');
      const isHunger = formula.innerHTML.endsWith('dg');

      const total = section.querySelector('span.part-total');
      const rolls = section.querySelectorAll('ol.dice-rolls > li.roll');
      let successes = 0;
      let criticals = 0;

      rolls.forEach(roll => {
        const value = parseInt(roll.innerText);
        if (value >= 6) {
          successes++;
        }
        if (value === 10) {
          criticals++;

          if (isHunger) {
            hungerCriticals++;
          }
        } else if (value === 1) {
          totalFailures++;

          if (isHunger) {
            hungerFailures++;
          }
        }
      });

      totalSuccesses += successes;
      totalCriticals += criticals;

      formula.innerText = isHunger ? 'Hunger Dice' : 'Normal Dice';
      total.innerText = successes + ' (' + total.innerText + ')';
    };

    const diceParts = messageContent.querySelectorAll('section.tooltip-part');
    diceParts.forEach(handleDicePart);

    if (totalCriticals >= 2) {
      const pairs = Math.floor(totalCriticals / 2);
      totalSuccesses += pairs * 2;
    }

    const diceTotal = messageContent.querySelector('h4.dice-total');
    diceTotal.innerText = totalSuccesses + ' (' + diceTotal.innerText + ')';

    const outcome = this.#analyzeRollOutcome(totalSuccesses, totalCriticals, totalFailures, hungerCriticals, hungerFailures, data.roll.difficulty || 1);
    const difficultyText = data.roll.difficulty ? ` (vs. ${data.roll.difficulty})` : '';

    const diceResult = messageContent.querySelector('div.dice-result');
    diceResult.innerHTML += `<h4 class="dice-total" style="color: ${outcome[1]};">${(outcome[0] + difficultyText)}</h4>`;

    await msg.update({
      content: messageContent.innerHTML
    });
  }

  static #analyzeRollOutcome(successes, criticals, failures, hungerCriticals, hungerFailures, difficulty) {
    const isSuccess = successes >= difficulty;
    const isCritical = criticals >= 2;
    const isMessy = hungerCriticals >= 1;
    const isBestial = hungerFailures >= 1;

    if (isSuccess && isCritical && isMessy) {
      return ROLL_OUTCOME.MESSY_CRITICAL;
    } else if (isSuccess && isCritical) {
      return ROLL_OUTCOME.CRITICAL_SUCCESS;
    } else if (isSuccess) {
      return ROLL_OUTCOME.SUCCESS;
    } else if (isBestial) {
      return ROLL_OUTCOME.BESTIAL_FAILURE;
    } else {
      return ROLL_OUTCOME.FAILURE;
    }
  }

  static #formatRollText(rollData) {
    const diceTexts = [];
    const {normalDices, hungerDices} = rollData;
    if (normalDices > 0) {
      diceTexts.push(`${normalDices}dv`);
    }
    if (hungerDices > 0) {
      diceTexts.push(`${hungerDices}dg`);
    }
    return diceTexts.join(' + ');
  }
}