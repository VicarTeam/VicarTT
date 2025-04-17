let lastRoll = undefined;

const ROLL_OUTCOME = {
  CRITICAL_SUCCESS: ['Critical Success', '#469B48'],
  MESSY_CRITICAL: ['Messy Critical', '#2E4B36'],
  SUCCESS: ['Success', '#026202'],
  FAILURE: ['Failure', 'red'],
  BESTIAL_FAILURE: ['Bestial Failure', 'darkred']
};

class VampiricDiceRoller {
  static async roll(data) {
    lastRoll = undefined;

    const isRerollable = data.roll.normalDices > 0;
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
    const normals = [];
    const hungers = [];

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

        if (isHunger) {
          hungers.push(value);
        } else {
          normals.push(value);
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

    if (isRerollable) {
      lastRoll = {
        msgId: msg.id,
        data,
        roll,
        result: {
          normals,
          hungers,
        }
      };
    }

    await msg.update({
      content: messageContent.innerHTML
    });
  }

  static async reroll(oldRoll, rerollDiceIndexes) {
    const roll = new Roll(`${rerollDiceIndexes.length}dv`);
    await roll.evaluate({
      async: true
    });

    const msg = await roll.toMessage();
    const html = await msg.getHTML();
    const messageElement = html.get(0);
    const messageContent = messageElement.querySelector('div.message-content');

    let usernameElement = ``;
    if (oldRoll.data.username && oldRoll.data.username !== '') {
      usernameElement = `<i style="font-size: 0.8rem">${oldRoll.data.username}</i>`;
    }

    if (oldRoll.data.vampire.avatar && oldRoll.data.vampire.avatar !== '') {
      messageContent.innerHTML = `<div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; margin-top: 0.3rem"><img src="${oldRoll.data.vampire.avatar}" style="width: 3rem; height: 3rem"><div style="display: flex; flex-direction: column; align-items: center; justify-content: flex-start"><span style="font-size: 1.1rem; font-weight: bold; width: 100%; text-align: left">${oldRoll.data.vampire.name}</span>${usernameElement}</div></div>` + messageContent.innerHTML;
    } else {
      messageContent.innerHTML = `<div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; margin-top: 0.3rem"><div style="display: flex; flex-direction: column; align-items: center; justify-content: flex-start"><span style="font-size: 1.1rem; font-weight: bold; width: 100%; text-align: left">${oldRoll.data.vampire.name}</span>${usernameElement}</div></div>` + messageContent.innerHTML;
    }

    const forumla = 'Willpower Reroll: ' + (oldRoll.result.normals.filter((_, idx) => rerollDiceIndexes.includes(idx)).join(', '));
    const filteredNormals = oldRoll.result.normals.filter((_, idx) => !rerollDiceIndexes.includes(idx));
    const rerolledNormals = roll.terms[0].results.map(dice => dice.result);

    let totalSuccesses = 0;
    let totalCriticals = 0;
    let totalFailures = 0;
    let hungerCriticals = 0;
    let hungerFailures = 0;
    let normalSuccesses = 0;
    let hungerSuccesses = 0;
    let sumHunger = 0;
    let sumNormal = 0;

    const normals = filteredNormals.concat(rerolledNormals);
    const hungers = oldRoll.result.hungers;

    normals.forEach(dice => {
      if (dice >= 6) {
        totalSuccesses++;
        normalSuccesses++;
      }
      if (dice === 10) {
        totalCriticals++;
      } else if (dice === 1) {
        totalFailures++;
      }

      sumNormal += dice;
    });

    hungers.forEach(dice => {
      if (dice >= 6) {
        totalSuccesses++;
        hungerSuccesses++;
      }
      if (dice === 10) {
        totalCriticals++;
        hungerCriticals++;
      } else if (dice === 1) {
        totalFailures++;
        hungerFailures++;
      }

      sumHunger += dice;
    });

    if (totalCriticals >= 2) {
      const pairs = Math.floor(totalCriticals / 2);
      totalSuccesses += pairs * 2;
    }

    const sum = sumNormal + sumHunger;
    const outcome = this.#analyzeRollOutcome(totalSuccesses, totalCriticals, totalFailures, hungerCriticals, hungerFailures, oldRoll.data.roll.difficulty || 1);
    const difficultyText = oldRoll.data.roll.difficulty ? ` (vs. ${oldRoll.data.roll.difficulty})` : '';

    const diceResultDiv = messageContent.querySelector('div.dice-result');
    diceResultDiv.innerHTML = '<div class="dice-formula">' + forumla + '</div>';

    if (normals.length > 0) {
      let code = `
      <div class="dice-tooltip" style="display: none">
        <section class="tooltip-part">
          <div class="dice">
            <header class="part-header flexrow"><span class="part-formula">Normal Dice</span><span class="part-total">${normalSuccesses} (${sumNormal})</span></header>
            <ol class="dice-rolls">
      `;

      filteredNormals.forEach(dice => {
        const classes = ["roll", "vampiredie", "d10"];
        if (dice === 10) {
          classes.push("max");
        } else if (dice === 1) {
          classes.push("min");
        }

        code += `<li class="${classes.join(' ')}">${dice}</li>`;
      });
      rerolledNormals.forEach(dice => {
        const classes = ["roll", "vampiredie", "d10"];
        if (dice === 10) {
          classes.push("max");
        } else if (dice === 1) {
          classes.push("min");
        }

        code += `<li class="${classes.join(' ')}" style="color: #9e0ace; filter: none">${dice}</li>`;
      });

      code += `</li></ol></div></section></div>`;

      diceResultDiv.innerHTML += code;
    }

    if (hungers.length > 0) {
      let code = `
      <div class="dice-tooltip" style="display: none">
        <section class="tooltip-part">
          <div class="dice">
            <header class="part-header flexrow"><span class="part-formula">Hunger Dice</span><span class="part-total">${hungerSuccesses} (${sumHunger})</span></header>
            <ol class="dice-rolls">
      `;

      hungers.forEach(dice => {
        const classes = ["roll", "vampiredie", "d10"];
        if (dice === 10) {
          classes.push("max");
        } else if (dice === 1) {
          classes.push("min");
        }

        code += `<li class="${classes.join(' ')}">${dice}</li>`;
      });

      code += `</li></ol></div></section></div>`;

      diceResultDiv.innerHTML += code;
    }

    diceResultDiv.innerHTML += `<h4 class="dice-total">${totalSuccesses} (${sum})</h4>`;
    diceResultDiv.innerHTML += `<h4 class="dice-total" style="color: ${outcome[1]};">${(outcome[0] + difficultyText)}</h4>`;

    lastRoll = {
      msgId: msg.id,
      data: oldRoll.data,
      roll,
      result: {
        normals,
        hungers,
      }
    };

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

function parseIntWithFallback(str, fallback) {
  const value = parseInt(str);
  if (isNaN(value)) {
    return fallback;
  }
  return value;
}

function calculateDicePool(normal, hunger) {
  const hungerDices = Math.min(hunger, normal);
  const normalDices = Math.max(0, normal - hungerDices);
  return {
    normalDices,
    hungerDices
  };
}

function errorMessage(chatLog, message) {
  ui.notifications.error(message);
}

// /vc <normal_dice> (<difficulty>=1) (<hunger_value>=0)
function _processCommandVC(chatLog, args) {
  const normal = parseInt(args[0]);
  if (isNaN(normal) || normal <= 0) {
    errorMessage(chatLog, 'Normal dice count must be greater than 0. /vc [normal_dice[ ([difficulty]=1) ([hunger_value]=0)');
    return;
  }

  const difficulty = parseIntWithFallback(args[1], 1);
  const hunger = parseIntWithFallback(args[2], 0);
  const {normalDices, hungerDices} = calculateDicePool(normal, hunger);

  _processInternalDiceRolling(normalDices, hungerDices, difficulty);
}

// /vch <normal_dice> <hunger_dice> (<difficulty>=1)
function _processCommandVCH(chatLog, args) {
  const normalDices = parseInt(args[0]);
  if (isNaN(normalDices) || normalDices <= 0) {
    errorMessage(chatLog, 'Normal dice count must be greater than 0. /vch [normal_dice] [hunger_dice] ([difficulty]=1)');
    return;
  }

  const hungerDices = parseInt(args[1]);
  if (isNaN(hungerDices)) {
    errorMessage(chatLog, 'Hunger dice is required. /vch [normal_dice] [hunger_dice] ([difficulty]=1)');
    return;
  }

  const difficulty = parseIntWithFallback(args[2], 1);

  _processInternalDiceRolling(normalDices, hungerDices, difficulty);
}

// /vcui
function _processCommandVCUI(chatLog) {
  const dialog = new Dialog({
    title: 'VicarTT Dice Roller',
    content: `<p>Normal Dices: <input id="vicartt-dr-normal" type="number" min="1" step="1" value="1"/></p><p>Hunger: <input id="vicartt-dr-hunger" type="number" min="0" max="5" step="1" value="0"/></p><p>Difficulty: <input id="vicartt-dr-diff" type="number" min="0" step="1" value="1"/></p>`,
    buttons: {
      ok: {
        icon: '<i class="fas fa-check"></i>',
        label: 'Roll',
        callback: () => {
          const normal = parseInt(document.getElementById('vicartt-dr-normal').value);
          if (isNaN(normal) || normal <= 0) {
            errorMessage(chatLog, 'Normal dice count must be greater than 0.');
            return;
          }

          const hunger = parseIntWithFallback(document.getElementById('vicartt-dr-hunger').value, 0);
          const difficulty = parseIntWithFallback(document.getElementById('vicartt-dr-diff').value, 1);
          const {normalDices, hungerDices} = calculateDicePool(normal, hunger);

          _processInternalDiceRolling(normalDices, hungerDices, difficulty);
        }
      },
      cancel: {
        icon: '<i class="fas fa-times"></i>',
        label: 'Cancel'
      }
    }
  });
  dialog.render(true);
}

function _processInternalDiceRolling(normalDices, hungerDices, difficulty) {
  const vampire = {name: '', avatar: ''};

  if (game.user.character) {
    vampire.name = game.user.character.name;
    vampire.avatar = game.user.character.img;
  } else if (game.user.isGM) {
    vampire.name = 'Storyteller';
    vampire.avatar = game.user.avatar;
  } else {
    vampire.name = game.user.name;
    vampire.avatar = "icons/svg/mystery-man.svg";
  }

  const data = {
    username: game.user.name,
    vampire,
    roll: {normalDices, hungerDices, difficulty}
  };

  VampiricDiceRoller.roll(data);
}

function _processCommandVCReroll(chatLog) {
  if (!lastRoll) {
    errorMessage(chatLog, 'No roll to reroll.');
    return;
  }

  window.vicartt_current_reroll_dices = [];
  window.vicartt_toggle_reroll = function (index) {
    const selectedIndex = window.vicartt_current_reroll_dices.indexOf(index);
    if (selectedIndex === -1) {
      if (window.vicartt_current_reroll_dices.length >= 3) {
        return;
      }

      window.vicartt_current_reroll_dices.push(index);

      const div = document.getElementById(`vicartt-reroll-dialog--dice-${index}`);
      if (div) {
        div.style.fontWeight = 'bold';
        div.style.color = '#6d0091';
        div.style.backgroundColor = '#d077ed';
        div.style.borderColor = '#6d0091';
      }
    } else {
      window.vicartt_current_reroll_dices.splice(selectedIndex, 1);

      const div = document.getElementById(`vicartt-reroll-dialog--dice-${index}`);
      if (div) {
        div.style.fontWeight = '';
        div.style.color = 'black';
        div.style.backgroundColor = 'transparent';
        div.style.borderColor = 'black';
      }
    }

    const left = document.getElementById('vicartt-reroll-dialog--left');
    if (left) {
      left.innerText = 3 - window.vicartt_current_reroll_dices.length;
    }
  }

  let code = `
  <div id="vicartt-reroll-dialog" style="display: flex; flex-direction: column">
  <b>Selected dices for reroll (<span id="vicartt-reroll-dialog--left">3</span> left):</b>
  <div style="display: flex; flex-direction: row; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.5rem">
`;

  lastRoll.result.normals.forEach((dice, index) => {
    code += `<div id="vicartt-reroll-dialog--dice-${index}" style="cursor: pointer; width: 2rem; height: 2rem; display: flex; align-items: center; justify-content: center; border-radius: 0.5rem; border: 1px solid black; background-color: transparent; font-weight: normal; color: black" onclick="window.vicartt_toggle_reroll(${index})">${dice}</div>`;
  });

  code += `</div></div>`;

  const dialog = new Dialog({
    title: 'VicarTT Willpower Reroll',
    content: code,
    buttons: {
      ok: {
        icon: '<i class="fas fa-check"></i>',
        label: 'Reroll',
        callback: () => {
          if (window.vicartt_current_reroll_dices.length === 0) {
            errorMessage(chatLog, 'No dices selected for reroll.');
            return;
          }

          VampiricDiceRoller.reroll(lastRoll, window.vicartt_current_reroll_dices);
          window.vicartt_current_reroll_dices = [];
        }
      },
      cancel: {
        icon: '<i class="fas fa-times"></i>',
        label: 'Cancel'
      }
    }
  });
  dialog.render(true);
}

Hooks.on('chatMessage', (chatLog, message, chatData) => {
  const trimmed = message.trim();
  const commands = {
    "/vc": _processCommandVC,
    "/vch": _processCommandVCH,
    "/vcui": _processCommandVCUI,
    "/vcrr": _processCommandVCReroll
  };

  const parts = trimmed.split(' ');
  const command = parts[0];
  const args = parts.slice(1);
  if (commands[command]) {
    commands[command](chatLog, args);
    return false;
  }
});