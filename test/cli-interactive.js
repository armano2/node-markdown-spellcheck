import { expect } from 'chai';
import proxyquire from 'proxyquire';
import sinon from 'sinon';

function getCliInteractive(
  spellConfig,
  spellcheck,
  inquirer,
  writeCorrections,
  index
) {
  return proxyquire('../lib/cli-interactive', {
    inquirer: inquirer,
    './write-corrections': { default: writeCorrections },
    './spell-config': { default: spellConfig },
    './spellcheck': { default: spellcheck },
    './index': { default: index }
  }).default;
}

function mockSpellConfig(globalWords, fileWords) {
  return {
    addToGlobalDictionary: sinon.stub(),
    addToFileDictionary: sinon.stub(),
    writeFile: sinon.stub().callsArg(0)
  };
}

function mockSpellcheck() {
  return {
    addWord: sinon.stub(),
    checkWord: sinon.stub()
  };
}

function mockInquirer() {
  return {
    prompt: sinon.stub().resolves()
  };
}

function mockWriteCorrections() {
  return sinon.stub().callsArg(3);
}

function mockIndex(mistakes) {
  return {
    spellCallback(ignore, ignore2, perMistake, endOfFile) {
      if (mistakes) {
        const next = () => {
          if (mistakes.length) {
            const wordInfo = { word: mistakes.pop(), index: 0 };
            perMistake(wordInfo, next);
          } else {
            endOfFile();
          }
        };
        next();
      } else {
        endOfFile();
      }
    }
  };
}

describe('cli interactive', () => {
  it('should work with no mistakes', () => {
    const cliInteractive = getCliInteractive(
      mockSpellConfig(),
      mockSpellcheck(),
      mockInquirer(),
      mockWriteCorrections(),
      mockIndex()
    );
    const fileProcessed = sinon.spy();
    cliInteractive('myfile', '', {}, fileProcessed);

    expect(fileProcessed.calledOnce).to.equal(true);
  });

  it('should work with a single ignore', () => {
    const inquirer = mockInquirer();
    const spellcheck = mockSpellcheck();
    const cliInteractive = getCliInteractive(
      mockSpellConfig(),
      spellcheck,
      inquirer,
      mockWriteCorrections(),
      mockIndex(['mispelt'])
    );
    const fileProcessed = sinon.spy();
    cliInteractive('myfile', '', {}, fileProcessed);

    inquirer.prompt().then(({ action = 'ignore' } = {}) => {
      expect(fileProcessed.calledOnce).to.equal(true);
      expect(spellcheck.addWord.calledOnce).to.equal(true);
    });
  });

  it('correct word with 2 words', () => {
    const inquirer = mockInquirer();
    const spellcheck = mockSpellcheck();
    const writeCorrections = mockWriteCorrections();
    const cliInteractive = getCliInteractive(
      mockSpellConfig(),
      spellcheck,
      inquirer,
      writeCorrections,
      mockIndex(['twowords'])
    );
    const fileProcessed = sinon.spy();
    cliInteractive('myfile', '', {}, fileProcessed);

    inquirer.prompt().then(({ action = 'enter' } = {}) => {
      spellcheck.checkWord.onCall(0).returns(true);
      spellcheck.checkWord.onCall(1).returns(true);

      inquirer.prompt().then(({ word = 'two words' } = {}) => {
        expect(spellcheck.checkWord.calledTwice).to.equal(true);

        expect(writeCorrections.calledOnce).to.equal(true);
        expect(writeCorrections.firstCall.args[2]).to.deep.equal([
          {
            newWord: 'two words',
            wordInfo: {
              index: 0,
              word: 'twowords'
            }
          }
        ]);
        expect(fileProcessed.calledOnce).to.equal(true);
      });
    });
  });

  it('correct word with incorrect word', () => {
    const inquirer = mockInquirer();
    const spellcheck = mockSpellcheck();
    const writeCorrections = mockWriteCorrections();
    const cliInteractive = getCliInteractive(
      mockSpellConfig(),
      spellcheck,
      inquirer,
      writeCorrections,
      mockIndex(['incorect'])
    );
    const fileProcessed = sinon.spy();
    cliInteractive('myfile', '', {}, fileProcessed);

    inquirer.prompt().then(({ action = 'enter' } = {}) => {
      spellcheck.checkWord.onCall(0).returns(false);
      inquirer.prompt().then(({ word = 'incorret' } = {}) => {
        inquirer.prompt().then(({ action = 'enter' } = {}) => {
          spellcheck.checkWord.onCall(1).returns(true);
          inquirer.prompt().then(({ word = 'incorret' } = {}) => {
            expect(writeCorrections.calledOnce).to.equal(true);
            expect(writeCorrections.firstCall.args[2]).to.deep.equal([
              {
                newWord: 'incorrect',
                wordInfo: {
                  index: 0,
                  word: 'incorect'
                }
              }
            ]);
            expect(fileProcessed.calledOnce).to.equal(true);
          });
        });
      });
    });
  });

  it('correct word with filtered word', () => {
    const inquirer = mockInquirer();
    const spellcheck = mockSpellcheck();
    const writeCorrections = mockWriteCorrections();
    const cliInteractive = getCliInteractive(
      mockSpellConfig(),
      spellcheck,
      inquirer,
      writeCorrections,
      mockIndex(['incorect'])
    );
    const fileProcessed = sinon.spy();
    cliInteractive('myfile', '', { ignoreAcronyms: true }, fileProcessed);

    inquirer.prompt().then(({ action = 'enter' } = {}) => {
      spellcheck.checkWord.onCall(0).returns(false);
      inquirer.prompt().then(({ word = 'ABS' } = {}) => {
        expect(writeCorrections.calledOnce).to.equal(true);
        expect(writeCorrections.firstCall.args[2]).to.deep.equal([
          {
            newWord: 'ABS',
            wordInfo: {
              index: 0,
              word: 'incorect'
            }
          }
        ]);
        expect(fileProcessed.calledOnce).to.equal(true);
      });
    });
  });
  // todo more tests
});
