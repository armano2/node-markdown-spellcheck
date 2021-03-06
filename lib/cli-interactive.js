const markdownSpellcheck = require('./index');
const spellcheck = require('./spellcheck');
const inquirer = require('inquirer');
const filters = require('./filters');
const context = require('./context');
const spellConfig = require('./spell-config');
const writeCorrections = require('./write-corrections');

const ACTION_IGNORE = 'ignore';
const ACTION_FILE_IGNORE = 'fileignore';
const ACTION_FILE_IGNORE_RELATIVE = 'fileignore-relative';
const ACTION_ADD = 'add';
const ACTION_ADD_CASED = 'add-cased';
const ACTION_ADD_RELATIVE = 'add-relative';
const ACTION_ADD_CASED_RELATIVE = 'add-cased-relative';
const ACTION_CORRECT = 'enter';

const CHOICE_IGNORE = { name: 'Ignore', value: ACTION_IGNORE };
const CHOICE_FILE_IGNORE = {
  name: 'Add to file ignores',
  value: ACTION_FILE_IGNORE
};
const CHOICE_FILE_IGNORE_RELATIVE = {
  name: '[Relative] Add to file ignores',
  value: ACTION_FILE_IGNORE_RELATIVE
};
const CHOICE_ADD = {
  name: 'Add to dictionary - case insensitive',
  value: ACTION_ADD
};
const CHOICE_ADD_CASED = {
  name: 'Add to dictionary - case sensitive',
  value: ACTION_ADD_CASED
};
const CHOICE_ADD_RELATIVE = {
  name: '[Relative] Add to dictionary - case insensitive',
  value: ACTION_ADD_RELATIVE
};
const CHOICE_ADD_CASED_RELATIVE = {
  name: '[Relative] Add to dictionary - case sensitive',
  value: ACTION_ADD_CASED_RELATIVE
};
const CHOICE_CORRECT = {
  name: 'Enter correct spelling',
  value: ACTION_CORRECT
};

const previousChoices = Object.create(null);

async function incorrectWordChoices(word, message, filename, options, done) {
  const suggestions = options.suggestions ? await spellcheck.suggest(word) : [];

  const choices = [
    CHOICE_IGNORE,
    options.relativeSpellingFiles
      ? CHOICE_FILE_IGNORE_RELATIVE
      : CHOICE_FILE_IGNORE,
    CHOICE_ADD,
    CHOICE_CORRECT
  ];

  if (options.relativeSpellingFiles) {
    choices.splice(4, 0, CHOICE_ADD_RELATIVE);
  }

  if (word.match(/[A-Z]/)) {
    choices.splice(3, 0, CHOICE_ADD_CASED);
    if (options.relativeSpellingFiles) {
      choices.splice(5, 0, CHOICE_ADD_CASED_RELATIVE);
    }
  }

  let defaultAction = ACTION_CORRECT;
  if (previousChoices[word]) {
    const previousAction = previousChoices[word];
    if (previousAction.newWord) {
      const suggestionIndex = suggestions.indexOf(previousAction.newWord);
      if (suggestions.indexOf(previousAction.newWord) >= 0) {
        defaultAction = suggestionIndex.toString();
      } else {
        suggestions.unshift(previousAction.newWord);
        defaultAction = '0';
      }
    } else {
      defaultAction = previousAction.action;
    }
  }

  suggestions.forEach((suggestion, index) => {
    choices.push({
      key: index,
      name: suggestion,
      value: index.toString()
    });
  });

  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: message,
      choices,
      default: defaultAction
    }
  ]);

  switch (answer.action) {
    case ACTION_ADD:
      word = word.toLowerCase();
    /* fallthrough */
    case ACTION_ADD_CASED:
      spellcheck.addWord(word);
      spellConfig.addToGlobalDictionary(word);
      done();
      break;
    case ACTION_ADD_RELATIVE:
      word = word.toLowerCase();
    /* fallthrough */
    case ACTION_ADD_CASED_RELATIVE:
      spellcheck.addWord(word);
      spellConfig.addToGlobalDictionary(word, true);
      done();
      break;
    case ACTION_CORRECT:
      await getCorrectWord(word, filename, options, done);
      break;
    case ACTION_FILE_IGNORE:
      spellcheck.addWord(word, true);
      spellConfig.addToFileDictionary(filename, word);
      previousChoices[word] = answer;
      done();
      break;
    case ACTION_FILE_IGNORE_RELATIVE:
      spellcheck.addWord(word, true);
      spellConfig.addToFileDictionary(filename, word, true);
      previousChoices[word] = answer;
      done();
      break;
    case ACTION_IGNORE:
      spellcheck.addWord(word);
      done();
      break;
    default: {
      const suggestionId = Number(answer.action);
      if (isNaN(suggestionId) || suggestionId >= suggestions.length) {
        throw new Error('unrecognise prompt action');
      }
      previousChoices[word] = { newWord: suggestions[suggestionId] };
      done(suggestions[Number(answer.action)]);
      break;
    }
  }
}

async function getCorrectWord(word, filename, options, done) {
  const answer = await inquirer.prompt([
    {
      type: 'input',
      name: 'word',
      message: 'correct word >',
      default: word
    }
  ]);

  const newWords = answer.word
    .split(/\s/g)
    .filter(newWord => filters.filter([{ word: newWord }], options).length > 0);

  const hasMistake = await Promise.all(
    newWords.map(newWord => spellcheck.checkWord(newWord))
  );

  if (hasMistake.some(value => !value)) {
    if (newWords.length === 1) {
      await incorrectWordChoices(
        answer.word,
        'Corrected word is not in dictionary..',
        filename,
        options,
        newNewWord => {
          const finalNewWord = newNewWord || answer.word;
          previousChoices[word] = { newWord: finalNewWord };
          done(finalNewWord);
        }
      );
      return;
    }

    console.log(
      'Detected some words in your correction that may be invalid. Re-run to check.'
    );
  }

  previousChoices[word] = { newWord: answer.word };
  done(answer.word);
}

async function spellAndFixFile(filename, src, options, onFinishedFile) {
  const corrections = [];

  function onSpellingMistake(wordInfo, done) {
    const displayBlock = context.getBlock(
      src,
      wordInfo.index,
      wordInfo.word.length
    );
    console.log(displayBlock.info);
    incorrectWordChoices(wordInfo.word, ' ', filename, options, newWord => {
      if (newWord) {
        corrections.push({ wordInfo, newWord });
      }
      done();
    });
  }

  await markdownSpellcheck.spellCallback(
    src,
    options,
    onSpellingMistake,
    () => {
      if (corrections.length) {
        writeCorrections.writeCorrections(
          src,
          filename,
          corrections,
          onFinishedFile
        );
      } else {
        onFinishedFile();
      }
    }
  );
}

module.exports = function(file, src, options, fileProcessed) {
  spellAndFixFile(file, src, options, () => {
    spellConfig.writeFile(() => {
      if (options.relativeSpellingFiles) {
        spellConfig.writeFile(fileProcessed, true);
      } else {
        fileProcessed();
      }
    });
  });
};
