const fs = require('fs');

let globalDictionary = [];
let fileDictionary = {};
let sharedSpelling = {};
let relativeSpelling = {};

function spellingFile(fileName) {
  return {
    fileName,
    fileLines: [],
    lastLineOfGlobalSpellings: -1,
    isCrLf: false,
    isDirty: false
  };
}

function parse(spelling) {
  let lastNonCommentIndex = -1;
  let inGlobal = true;
  let currentFile;
  spelling.fileLines.forEach((line, index) => {
    if (!line || line.indexOf('#') === 0) {
      return;
    }
    let fileMatch = line.match(/^\s*-\s+(.*)/);
    if (fileMatch) {
      if (inGlobal) {
        spelling.lastLineOfGlobalSpellings =
          lastNonCommentIndex === -1 ? index : lastNonCommentIndex + 1;
        inGlobal = false;
      } else {
        fileDictionary[currentFile].index = lastNonCommentIndex + 1;
      }
      currentFile = fileMatch[1];
      fileDictionary[currentFile] = { words: [] };
    } else {
      let word = line.trim();
      if (inGlobal) {
        globalDictionary.push(word);
      } else {
        fileDictionary[currentFile].words.push(word);
      }
    }
    lastNonCommentIndex = index;
  });
  // make sure we end on a new-line
  if (spelling.fileLines[spelling.fileLines.length - 1]) {
    spelling.fileLines[spelling.fileLines.length] = '';
  }
  if (inGlobal) {
    spelling.lastLineOfGlobalSpellings =
      lastNonCommentIndex === -1
        ? spelling.fileLines.length - 1
        : lastNonCommentIndex + 1;
  } else {
    fileDictionary[currentFile].index = lastNonCommentIndex;
  }
}

function emptyFile(spelling) {
  spelling.fileLines = [
    '# markdown-spellcheck spelling configuration file',
    '# Format - lines beginning # are comments',
    '# global dictionary is at the start, file overrides afterwards',
    "# one word per line, to define a file override use ' - filename'",
    '# where filename is relative to this configuration file',
    ''
  ];
  spelling.lastLineOfGlobalSpellings = spelling.fileLines.length - 1;
}

function initConfig() {
  globalDictionary = [];
  fileDictionary = {};
  sharedSpelling = spellingFile('./.spelling');
  relativeSpelling = spellingFile('');
}

function loadAndParseSpelling(spelling) {
  return new Promise(resolve => {
    fs.readFile(spelling.fileName, 'utf-8', (err, data) => {
      if (err) {
        emptyFile(spelling);
        return resolve(err);
      }
      if (data.indexOf('\r') >= 0) {
        spelling.isCrLf = true;
        data = data.replace(/\r/g, '');
      }

      spelling.fileLines = data.split('\n');
      parse(spelling);
      return resolve();
    });
  });
}

async function initialise(filename) {
  initConfig();
  relativeSpelling.fileName = filename;
  if (filename === './.spelling') {
    await loadAndParseSpelling(sharedSpelling);
  } else {
    await Promise.all([
      loadAndParseSpelling(sharedSpelling),
      loadAndParseSpelling(relativeSpelling)
    ]);
  }
  return true;
}

function writeFile(done, relative) {
  const spelling = relative ? relativeSpelling : sharedSpelling;
  if (spelling.isDirty) {
    const data = spelling.fileLines.join(spelling.isCrLf ? '\r\n' : '\n');
    fs.writeFile(spelling.fileName, data, err => {
      if (err) {
        throw new Error(`Failed to save spelling file. ${err.message}`);
      } else {
        spelling.isDirty = false;
      }
      done();
    });
  } else {
    done();
  }
}

function addToGlobalDictionary(word, relative) {
  const spelling = relative ? relativeSpelling : sharedSpelling;
  globalDictionary.push(word);
  spelling.fileLines.splice(spelling.lastLineOfGlobalSpellings, 0, word);
  spelling.isDirty = true;
  spelling.lastLineOfGlobalSpellings++;
  for (let filename in fileDictionary) {
    if (fileDictionary.hasOwnProperty(filename)) {
      fileDictionary[filename].index++;
    }
  }
}

function addToFileDictionary(filename, word, relative) {
  const spelling = relative ? relativeSpelling : sharedSpelling;
  if (fileDictionary.hasOwnProperty(filename)) {
    let fileDict = fileDictionary[filename];
    spelling.fileLines.splice(fileDict.index, 0, word);
    spelling.isDirty = true;
    for (let dictionaryFilename in fileDictionary) {
      if (
        fileDictionary.hasOwnProperty(dictionaryFilename) &&
        fileDictionary[dictionaryFilename].index >= fileDict.index
      ) {
        fileDictionary[dictionaryFilename].index++;
      }
    }
    fileDict.words.push(word);
  } else {
    spelling.fileLines.splice(
      spelling.fileLines.length - 1,
      0,
      ' - ' + filename,
      word
    );
    spelling.isDirty = true;
    fileDictionary[filename] = {
      index: spelling.fileLines.length - 1,
      words: [word]
    };
  }
}

function getGlobalWords() {
  return globalDictionary;
}

function getFileWords(filename) {
  if (fileDictionary.hasOwnProperty(filename)) {
    return fileDictionary[filename].words;
  }
  return [];
}

module.exports = {
  initialise,
  writeFile,
  addToGlobalDictionary,
  addToFileDictionary,
  getGlobalWords,
  getFileWords
};
