require=(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var sheet = require('@emotion/sheet');
var Stylis = _interopDefault(require('@emotion/stylis'));
require('@emotion/weak-memoize');

// https://github.com/thysultan/stylis.js/tree/master/plugins/rule-sheet
// inlined to avoid umd wrapper and peerDep warnings/installing stylis
// since we use stylis after closure compiler
var delimiter = '/*|*/';
var needle = delimiter + '}';

function toSheet(block) {
  if (block) {
    Sheet.current.insert(block + '}');
  }
}

var Sheet = {
  current: null
};
var ruleSheet = function ruleSheet(context, content, selectors, parents, line, column, length, ns, depth, at) {
  switch (context) {
    // property
    case 1:
      {
        switch (content.charCodeAt(0)) {
          case 64:
            {
              // @import
              Sheet.current.insert(content + ';');
              return '';
            }
          // charcode for l

          case 108:
            {
              // charcode for b
              // this ignores label
              if (content.charCodeAt(2) === 98) {
                return '';
              }
            }
        }

        break;
      }
    // selector

    case 2:
      {
        if (ns === 0) return content + delimiter;
        break;
      }
    // at-rule

    case 3:
      {
        switch (ns) {
          // @font-face, @page
          case 102:
          case 112:
            {
              Sheet.current.insert(selectors[0] + content);
              return '';
            }

          default:
            {
              return content + (at === 0 ? delimiter : '');
            }
        }
      }

    case -2:
      {
        content.split(needle).forEach(toSheet);
      }
  }
};

var createCache = function createCache(options) {
  if (options === undefined) options = {};
  var key = options.key || 'css';
  var stylisOptions;

  if (options.prefix !== undefined) {
    stylisOptions = {
      prefix: options.prefix
    };
  }

  var stylis = new Stylis(stylisOptions);

  if ("production" !== 'production') {
    // $FlowFixMe
    if (/[^a-z-]/.test(key)) {
      throw new Error("Emotion key must only contain lower case alphabetical characters and - but \"" + key + "\" was passed");
    }
  }

  var inserted = {}; // $FlowFixMe

  var container;

  {
    container = options.container || document.head;
    var nodes = document.querySelectorAll("style[data-emotion-" + key + "]");
    Array.prototype.forEach.call(nodes, function (node) {
      var attrib = node.getAttribute("data-emotion-" + key); // $FlowFixMe

      attrib.split(' ').forEach(function (id) {
        inserted[id] = true;
      });

      if (node.parentNode !== container) {
        container.appendChild(node);
      }
    });
  }

  var _insert;

  {
    stylis.use(options.stylisPlugins)(ruleSheet);

    _insert = function insert(selector, serialized, sheet, shouldCache) {
      var name = serialized.name;
      Sheet.current = sheet;

      if ("production" !== 'production' && serialized.map !== undefined) {
        var map = serialized.map;
        Sheet.current = {
          insert: function insert(rule) {
            sheet.insert(rule + map);
          }
        };
      }

      stylis(selector, serialized.styles);

      if (shouldCache) {
        cache.inserted[name] = true;
      }
    };
  }

  if ("production" !== 'production') {
    // https://esbench.com/bench/5bf7371a4cd7e6009ef61d0a
    var commentStart = /\/\*/g;
    var commentEnd = /\*\//g;
    stylis.use(function (context, content) {
      switch (context) {
        case -1:
          {
            while (commentStart.test(content)) {
              commentEnd.lastIndex = commentStart.lastIndex;

              if (commentEnd.test(content)) {
                commentStart.lastIndex = commentEnd.lastIndex;
                continue;
              }

              throw new Error('Your styles have an unterminated comment ("/*" without corresponding "*/").');
            }

            commentStart.lastIndex = 0;
            break;
          }
      }
    });
    stylis.use(function (context, content, selectors) {
      switch (context) {
        case -1:
          {
            var flag = 'emotion-disable-server-rendering-unsafe-selector-warning-please-do-not-use-this-the-warning-exists-for-a-reason';
            var unsafePseudoClasses = content.match(/(:first|:nth|:nth-last)-child/g);

            if (unsafePseudoClasses && cache.compat !== true) {
              unsafePseudoClasses.forEach(function (unsafePseudoClass) {
                var ignoreRegExp = new RegExp(unsafePseudoClass + ".*\\/\\* " + flag + " \\*\\/");
                var ignore = ignoreRegExp.test(content);

                if (unsafePseudoClass && !ignore) {
                  console.error("The pseudo class \"" + unsafePseudoClass + "\" is potentially unsafe when doing server-side rendering. Try changing it to \"" + unsafePseudoClass.split('-child')[0] + "-of-type\".");
                }
              });
            }

            break;
          }
      }
    });
  }

  var cache = {
    key: key,
    sheet: new sheet.StyleSheet({
      key: key,
      container: container,
      nonce: options.nonce,
      speedy: options.speedy
    }),
    nonce: options.nonce,
    inserted: inserted,
    registered: {},
    insert: _insert
  };
  return cache;
};

exports.default = createCache;

},{"@emotion/sheet":5,"@emotion/stylis":6,"@emotion/weak-memoize":9}],2:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

/* eslint-disable */
// Inspired by https://github.com/garycourt/murmurhash-js
// Ported from https://github.com/aappleby/smhasher/blob/61a0530f28277f2e850bfc39600ce61d02b518de/src/MurmurHash2.cpp#L37-L86
function murmur2(str) {
  // 'm' and 'r' are mixing constants generated offline.
  // They're not really 'magic', they just happen to work well.
  // const m = 0x5bd1e995;
  // const r = 24;
  // Initialize the hash
  var h = 0; // Mix 4 bytes at a time into the hash

  var k,
      i = 0,
      len = str.length;

  for (; len >= 4; ++i, len -= 4) {
    k = str.charCodeAt(i) & 0xff | (str.charCodeAt(++i) & 0xff) << 8 | (str.charCodeAt(++i) & 0xff) << 16 | (str.charCodeAt(++i) & 0xff) << 24;
    k =
    /* Math.imul(k, m): */
    (k & 0xffff) * 0x5bd1e995 + ((k >>> 16) * 0xe995 << 16);
    k ^=
    /* k >>> r: */
    k >>> 24;
    h =
    /* Math.imul(k, m): */
    (k & 0xffff) * 0x5bd1e995 + ((k >>> 16) * 0xe995 << 16) ^
    /* Math.imul(h, m): */
    (h & 0xffff) * 0x5bd1e995 + ((h >>> 16) * 0xe995 << 16);
  } // Handle the last few bytes of the input array


  switch (len) {
    case 3:
      h ^= (str.charCodeAt(i + 2) & 0xff) << 16;

    case 2:
      h ^= (str.charCodeAt(i + 1) & 0xff) << 8;

    case 1:
      h ^= str.charCodeAt(i) & 0xff;
      h =
      /* Math.imul(h, m): */
      (h & 0xffff) * 0x5bd1e995 + ((h >>> 16) * 0xe995 << 16);
  } // Do a few final mixes of the hash to ensure the last few
  // bytes are well-incorporated.


  h ^= h >>> 13;
  h =
  /* Math.imul(h, m): */
  (h & 0xffff) * 0x5bd1e995 + ((h >>> 16) * 0xe995 << 16);
  return ((h ^ h >>> 15) >>> 0).toString(36);
}

exports.default = murmur2;

},{}],3:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function memoize(fn) {
  var cache = {};
  return function (arg) {
    if (cache[arg] === undefined) cache[arg] = fn(arg);
    return cache[arg];
  };
}

exports.default = memoize;

},{}],4:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var hashString = _interopDefault(require('@emotion/hash'));
var unitless = _interopDefault(require('@emotion/unitless'));
var memoize = _interopDefault(require('@emotion/memoize'));

var ILLEGAL_ESCAPE_SEQUENCE_ERROR = "You have illegal escape sequence in your template literal, most likely inside content's property value.\nBecause you write your CSS inside a JavaScript string you actually have to do double escaping, so for example \"content: '\\00d7';\" should become \"content: '\\\\00d7';\".\nYou can read more about this here:\nhttps://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals#ES2018_revision_of_illegal_escape_sequences";
var UNDEFINED_AS_OBJECT_KEY_ERROR = "You have passed in falsy value as style object's key (can happen when in example you pass unexported component as computed key).";
var hyphenateRegex = /[A-Z]|^ms/g;
var animationRegex = /_EMO_([^_]+?)_([^]*?)_EMO_/g;

var isCustomProperty = function isCustomProperty(property) {
  return property.charCodeAt(1) === 45;
};

var isProcessableValue = function isProcessableValue(value) {
  return value != null && typeof value !== 'boolean';
};

var processStyleName = memoize(function (styleName) {
  return isCustomProperty(styleName) ? styleName : styleName.replace(hyphenateRegex, '-$&').toLowerCase();
});

var processStyleValue = function processStyleValue(key, value) {
  switch (key) {
    case 'animation':
    case 'animationName':
      {
        if (typeof value === 'string') {
          return value.replace(animationRegex, function (match, p1, p2) {
            cursor = {
              name: p1,
              styles: p2,
              next: cursor
            };
            return p1;
          });
        }
      }
  }

  if (unitless[key] !== 1 && !isCustomProperty(key) && typeof value === 'number' && value !== 0) {
    return value + 'px';
  }

  return value;
};

if ("production" !== 'production') {
  var contentValuePattern = /(attr|calc|counters?|url)\(/;
  var contentValues = ['normal', 'none', 'counter', 'open-quote', 'close-quote', 'no-open-quote', 'no-close-quote', 'initial', 'inherit', 'unset'];
  var oldProcessStyleValue = processStyleValue;
  var msPattern = /^-ms-/;
  var hyphenPattern = /-(.)/g;
  var hyphenatedCache = {};

  processStyleValue = function processStyleValue(key, value) {
    if (key === 'content') {
      if (typeof value !== 'string' || contentValues.indexOf(value) === -1 && !contentValuePattern.test(value) && (value.charAt(0) !== value.charAt(value.length - 1) || value.charAt(0) !== '"' && value.charAt(0) !== "'")) {
        console.error("You seem to be using a value for 'content' without quotes, try replacing it with `content: '\"" + value + "\"'`");
      }
    }

    var processed = oldProcessStyleValue(key, value);

    if (processed !== '' && !isCustomProperty(key) && key.indexOf('-') !== -1 && hyphenatedCache[key] === undefined) {
      hyphenatedCache[key] = true;
      console.error("Using kebab-case for css properties in objects is not supported. Did you mean " + key.replace(msPattern, 'ms-').replace(hyphenPattern, function (str, _char) {
        return _char.toUpperCase();
      }) + "?");
    }

    return processed;
  };
}

var shouldWarnAboutInterpolatingClassNameFromCss = true;

function handleInterpolation(mergedProps, registered, interpolation, couldBeSelectorInterpolation) {
  if (interpolation == null) {
    return '';
  }

  if (interpolation.__emotion_styles !== undefined) {
    if ("production" !== 'production' && interpolation.toString() === 'NO_COMPONENT_SELECTOR') {
      throw new Error('Component selectors can only be used in conjunction with babel-plugin-emotion.');
    }

    return interpolation;
  }

  switch (typeof interpolation) {
    case 'boolean':
      {
        return '';
      }

    case 'object':
      {
        if (interpolation.anim === 1) {
          cursor = {
            name: interpolation.name,
            styles: interpolation.styles,
            next: cursor
          };
          return interpolation.name;
        }

        if (interpolation.styles !== undefined) {
          var next = interpolation.next;

          if (next !== undefined) {
            // not the most efficient thing ever but this is a pretty rare case
            // and there will be very few iterations of this generally
            while (next !== undefined) {
              cursor = {
                name: next.name,
                styles: next.styles,
                next: cursor
              };
              next = next.next;
            }
          }

          var styles = interpolation.styles + ";";

          if ("production" !== 'production' && interpolation.map !== undefined) {
            styles += interpolation.map;
          }

          return styles;
        }

        return createStringFromObject(mergedProps, registered, interpolation);
      }

    case 'function':
      {
        if (mergedProps !== undefined) {
          var previousCursor = cursor;
          var result = interpolation(mergedProps);
          cursor = previousCursor;
          return handleInterpolation(mergedProps, registered, result, couldBeSelectorInterpolation);
        } else if ("production" !== 'production') {
          console.error('Functions that are interpolated in css calls will be stringified.\n' + 'If you want to have a css call based on props, create a function that returns a css call like this\n' + 'let dynamicStyle = (props) => css`color: ${props.color}`\n' + 'It can be called directly with props or interpolated in a styled call like this\n' + "let SomeComponent = styled('div')`${dynamicStyle}`");
        }

        break;
      }

    case 'string':
      if ("production" !== 'production') {
        var matched = [];
        var replaced = interpolation.replace(animationRegex, function (match, p1, p2) {
          var fakeVarName = "animation" + matched.length;
          matched.push("const " + fakeVarName + " = keyframes`" + p2.replace(/^@keyframes animation-\w+/, '') + "`");
          return "${" + fakeVarName + "}";
        });

        if (matched.length) {
          console.error('`keyframes` output got interpolated into plain string, please wrap it with `css`.\n\n' + 'Instead of doing this:\n\n' + [].concat(matched, ["`" + replaced + "`"]).join('\n') + '\n\nYou should wrap it with `css` like this:\n\n' + ("css`" + replaced + "`"));
        }
      }

      break;
  } // finalize string values (regular strings and functions interpolated into css calls)


  if (registered == null) {
    return interpolation;
  }

  var cached = registered[interpolation];

  if ("production" !== 'production' && couldBeSelectorInterpolation && shouldWarnAboutInterpolatingClassNameFromCss && cached !== undefined) {
    console.error('Interpolating a className from css`` is not recommended and will cause problems with composition.\n' + 'Interpolating a className from css`` will be completely unsupported in a future major version of Emotion');
    shouldWarnAboutInterpolatingClassNameFromCss = false;
  }

  return cached !== undefined && !couldBeSelectorInterpolation ? cached : interpolation;
}

function createStringFromObject(mergedProps, registered, obj) {
  var string = '';

  if (Array.isArray(obj)) {
    for (var i = 0; i < obj.length; i++) {
      string += handleInterpolation(mergedProps, registered, obj[i], false);
    }
  } else {
    for (var _key in obj) {
      var value = obj[_key];

      if (typeof value !== 'object') {
        if (registered != null && registered[value] !== undefined) {
          string += _key + "{" + registered[value] + "}";
        } else if (isProcessableValue(value)) {
          string += processStyleName(_key) + ":" + processStyleValue(_key, value) + ";";
        }
      } else {
        if (_key === 'NO_COMPONENT_SELECTOR' && "production" !== 'production') {
          throw new Error('Component selectors can only be used in conjunction with babel-plugin-emotion.');
        }

        if (Array.isArray(value) && typeof value[0] === 'string' && (registered == null || registered[value[0]] === undefined)) {
          for (var _i = 0; _i < value.length; _i++) {
            if (isProcessableValue(value[_i])) {
              string += processStyleName(_key) + ":" + processStyleValue(_key, value[_i]) + ";";
            }
          }
        } else {
          var interpolated = handleInterpolation(mergedProps, registered, value, false);

          switch (_key) {
            case 'animation':
            case 'animationName':
              {
                string += processStyleName(_key) + ":" + interpolated + ";";
                break;
              }

            default:
              {
                if ("production" !== 'production' && _key === 'undefined') {
                  console.error(UNDEFINED_AS_OBJECT_KEY_ERROR);
                }

                string += _key + "{" + interpolated + "}";
              }
          }
        }
      }
    }
  }

  return string;
}

var labelPattern = /label:\s*([^\s;\n{]+)\s*;/g;
var sourceMapPattern;

if ("production" !== 'production') {
  sourceMapPattern = /\/\*#\ssourceMappingURL=data:application\/json;\S+\s+\*\//;
} // this is the cursor for keyframes
// keyframes are stored on the SerializedStyles object as a linked list


var cursor;
var serializeStyles = function serializeStyles(args, registered, mergedProps) {
  if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null && args[0].styles !== undefined) {
    return args[0];
  }

  var stringMode = true;
  var styles = '';
  cursor = undefined;
  var strings = args[0];

  if (strings == null || strings.raw === undefined) {
    stringMode = false;
    styles += handleInterpolation(mergedProps, registered, strings, false);
  } else {
    if ("production" !== 'production' && strings[0] === undefined) {
      console.error(ILLEGAL_ESCAPE_SEQUENCE_ERROR);
    }

    styles += strings[0];
  } // we start at 1 since we've already handled the first arg


  for (var i = 1; i < args.length; i++) {
    styles += handleInterpolation(mergedProps, registered, args[i], styles.charCodeAt(styles.length - 1) === 46);

    if (stringMode) {
      if ("production" !== 'production' && strings[i] === undefined) {
        console.error(ILLEGAL_ESCAPE_SEQUENCE_ERROR);
      }

      styles += strings[i];
    }
  }

  var sourceMap;

  if ("production" !== 'production') {
    styles = styles.replace(sourceMapPattern, function (match) {
      sourceMap = match;
      return '';
    });
  } // using a global regex with .exec is stateful so lastIndex has to be reset each time


  labelPattern.lastIndex = 0;
  var identifierName = '';
  var match; // https://esbench.com/bench/5b809c2cf2949800a0f61fb5

  while ((match = labelPattern.exec(styles)) !== null) {
    identifierName += '-' + // $FlowFixMe we know it's not null
    match[1];
  }

  var name = hashString(styles) + identifierName;

  if ("production" !== 'production') {
    // $FlowFixMe SerializedStyles type doesn't have toString property (and we don't want to add it)
    return {
      name: name,
      styles: styles,
      map: sourceMap,
      next: cursor,
      toString: function toString() {
        return "You have tried to stringify object returned from `css` function. It isn't supposed to be used directly (e.g. as value of the `className` prop), but rather handed to emotion so it can handle it (e.g. as value of `css` prop).";
      }
    };
  }

  return {
    name: name,
    styles: styles,
    next: cursor
  };
};

exports.serializeStyles = serializeStyles;

},{"@emotion/hash":2,"@emotion/memoize":3,"@emotion/unitless":7}],5:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

/*

Based off glamor's StyleSheet, thanks Sunil ❤️

high performance StyleSheet for css-in-js systems

- uses multiple style tags behind the scenes for millions of rules
- uses `insertRule` for appending in production for *much* faster performance

// usage

import { StyleSheet } from '@emotion/sheet'

let styleSheet = new StyleSheet({ key: '', container: document.head })

styleSheet.insert('#box { border: 1px solid red; }')
- appends a css rule into the stylesheet

styleSheet.flush()
- empties the stylesheet of all its contents

*/
// $FlowFixMe
function sheetForTag(tag) {
  if (tag.sheet) {
    // $FlowFixMe
    return tag.sheet;
  } // this weirdness brought to you by firefox

  /* istanbul ignore next */


  for (var i = 0; i < document.styleSheets.length; i++) {
    if (document.styleSheets[i].ownerNode === tag) {
      // $FlowFixMe
      return document.styleSheets[i];
    }
  }
}

function createStyleElement(options) {
  var tag = document.createElement('style');
  tag.setAttribute('data-emotion', options.key);

  if (options.nonce !== undefined) {
    tag.setAttribute('nonce', options.nonce);
  }

  tag.appendChild(document.createTextNode(''));
  return tag;
}

var StyleSheet =
/*#__PURE__*/
function () {
  function StyleSheet(options) {
    this.isSpeedy = options.speedy === undefined ? "production" === 'production' : options.speedy;
    this.tags = [];
    this.ctr = 0;
    this.nonce = options.nonce; // key is the value of the data-emotion attribute, it's used to identify different sheets

    this.key = options.key;
    this.container = options.container;
    this.before = null;
  }

  var _proto = StyleSheet.prototype;

  _proto.insert = function insert(rule) {
    // the max length is how many rules we have per style tag, it's 65000 in speedy mode
    // it's 1 in dev because we insert source maps that map a single rule to a location
    // and you can only have one source map per style tag
    if (this.ctr % (this.isSpeedy ? 65000 : 1) === 0) {
      var _tag = createStyleElement(this);

      var before;

      if (this.tags.length === 0) {
        before = this.before;
      } else {
        before = this.tags[this.tags.length - 1].nextSibling;
      }

      this.container.insertBefore(_tag, before);
      this.tags.push(_tag);
    }

    var tag = this.tags[this.tags.length - 1];

    if (this.isSpeedy) {
      var sheet = sheetForTag(tag);

      try {
        // this is a really hot path
        // we check the second character first because having "i"
        // as the second character will happen less often than
        // having "@" as the first character
        var isImportRule = rule.charCodeAt(1) === 105 && rule.charCodeAt(0) === 64; // this is the ultrafast version, works across browsers
        // the big drawback is that the css won't be editable in devtools

        sheet.insertRule(rule, // we need to insert @import rules before anything else
        // otherwise there will be an error
        // technically this means that the @import rules will
        // _usually_(not always since there could be multiple style tags)
        // be the first ones in prod and generally later in dev
        // this shouldn't really matter in the real world though
        // @import is generally only used for font faces from google fonts and etc.
        // so while this could be technically correct then it would be slower and larger
        // for a tiny bit of correctness that won't matter in the real world
        isImportRule ? 0 : sheet.cssRules.length);
      } catch (e) {
        if ("production" !== 'production') {
          console.warn("There was a problem inserting the following rule: \"" + rule + "\"", e);
        }
      }
    } else {
      tag.appendChild(document.createTextNode(rule));
    }

    this.ctr++;
  };

  _proto.flush = function flush() {
    // $FlowFixMe
    this.tags.forEach(function (tag) {
      return tag.parentNode.removeChild(tag);
    });
    this.tags = [];
    this.ctr = 0;
  };

  return StyleSheet;
}();

exports.StyleSheet = StyleSheet;

},{}],6:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function stylis_min (W) {
  function M(d, c, e, h, a) {
    for (var m = 0, b = 0, v = 0, n = 0, q, g, x = 0, K = 0, k, u = k = q = 0, l = 0, r = 0, I = 0, t = 0, B = e.length, J = B - 1, y, f = '', p = '', F = '', G = '', C; l < B;) {
      g = e.charCodeAt(l);
      l === J && 0 !== b + n + v + m && (0 !== b && (g = 47 === b ? 10 : 47), n = v = m = 0, B++, J++);

      if (0 === b + n + v + m) {
        if (l === J && (0 < r && (f = f.replace(N, '')), 0 < f.trim().length)) {
          switch (g) {
            case 32:
            case 9:
            case 59:
            case 13:
            case 10:
              break;

            default:
              f += e.charAt(l);
          }

          g = 59;
        }

        switch (g) {
          case 123:
            f = f.trim();
            q = f.charCodeAt(0);
            k = 1;

            for (t = ++l; l < B;) {
              switch (g = e.charCodeAt(l)) {
                case 123:
                  k++;
                  break;

                case 125:
                  k--;
                  break;

                case 47:
                  switch (g = e.charCodeAt(l + 1)) {
                    case 42:
                    case 47:
                      a: {
                        for (u = l + 1; u < J; ++u) {
                          switch (e.charCodeAt(u)) {
                            case 47:
                              if (42 === g && 42 === e.charCodeAt(u - 1) && l + 2 !== u) {
                                l = u + 1;
                                break a;
                              }

                              break;

                            case 10:
                              if (47 === g) {
                                l = u + 1;
                                break a;
                              }

                          }
                        }

                        l = u;
                      }

                  }

                  break;

                case 91:
                  g++;

                case 40:
                  g++;

                case 34:
                case 39:
                  for (; l++ < J && e.charCodeAt(l) !== g;) {
                  }

              }

              if (0 === k) break;
              l++;
            }

            k = e.substring(t, l);
            0 === q && (q = (f = f.replace(ca, '').trim()).charCodeAt(0));

            switch (q) {
              case 64:
                0 < r && (f = f.replace(N, ''));
                g = f.charCodeAt(1);

                switch (g) {
                  case 100:
                  case 109:
                  case 115:
                  case 45:
                    r = c;
                    break;

                  default:
                    r = O;
                }

                k = M(c, r, k, g, a + 1);
                t = k.length;
                0 < A && (r = X(O, f, I), C = H(3, k, r, c, D, z, t, g, a, h), f = r.join(''), void 0 !== C && 0 === (t = (k = C.trim()).length) && (g = 0, k = ''));
                if (0 < t) switch (g) {
                  case 115:
                    f = f.replace(da, ea);

                  case 100:
                  case 109:
                  case 45:
                    k = f + '{' + k + '}';
                    break;

                  case 107:
                    f = f.replace(fa, '$1 $2');
                    k = f + '{' + k + '}';
                    k = 1 === w || 2 === w && L('@' + k, 3) ? '@-webkit-' + k + '@' + k : '@' + k;
                    break;

                  default:
                    k = f + k, 112 === h && (k = (p += k, ''));
                } else k = '';
                break;

              default:
                k = M(c, X(c, f, I), k, h, a + 1);
            }

            F += k;
            k = I = r = u = q = 0;
            f = '';
            g = e.charCodeAt(++l);
            break;

          case 125:
          case 59:
            f = (0 < r ? f.replace(N, '') : f).trim();
            if (1 < (t = f.length)) switch (0 === u && (q = f.charCodeAt(0), 45 === q || 96 < q && 123 > q) && (t = (f = f.replace(' ', ':')).length), 0 < A && void 0 !== (C = H(1, f, c, d, D, z, p.length, h, a, h)) && 0 === (t = (f = C.trim()).length) && (f = '\x00\x00'), q = f.charCodeAt(0), g = f.charCodeAt(1), q) {
              case 0:
                break;

              case 64:
                if (105 === g || 99 === g) {
                  G += f + e.charAt(l);
                  break;
                }

              default:
                58 !== f.charCodeAt(t - 1) && (p += P(f, q, g, f.charCodeAt(2)));
            }
            I = r = u = q = 0;
            f = '';
            g = e.charCodeAt(++l);
        }
      }

      switch (g) {
        case 13:
        case 10:
          47 === b ? b = 0 : 0 === 1 + q && 107 !== h && 0 < f.length && (r = 1, f += '\x00');
          0 < A * Y && H(0, f, c, d, D, z, p.length, h, a, h);
          z = 1;
          D++;
          break;

        case 59:
        case 125:
          if (0 === b + n + v + m) {
            z++;
            break;
          }

        default:
          z++;
          y = e.charAt(l);

          switch (g) {
            case 9:
            case 32:
              if (0 === n + m + b) switch (x) {
                case 44:
                case 58:
                case 9:
                case 32:
                  y = '';
                  break;

                default:
                  32 !== g && (y = ' ');
              }
              break;

            case 0:
              y = '\\0';
              break;

            case 12:
              y = '\\f';
              break;

            case 11:
              y = '\\v';
              break;

            case 38:
              0 === n + b + m && (r = I = 1, y = '\f' + y);
              break;

            case 108:
              if (0 === n + b + m + E && 0 < u) switch (l - u) {
                case 2:
                  112 === x && 58 === e.charCodeAt(l - 3) && (E = x);

                case 8:
                  111 === K && (E = K);
              }
              break;

            case 58:
              0 === n + b + m && (u = l);
              break;

            case 44:
              0 === b + v + n + m && (r = 1, y += '\r');
              break;

            case 34:
            case 39:
              0 === b && (n = n === g ? 0 : 0 === n ? g : n);
              break;

            case 91:
              0 === n + b + v && m++;
              break;

            case 93:
              0 === n + b + v && m--;
              break;

            case 41:
              0 === n + b + m && v--;
              break;

            case 40:
              if (0 === n + b + m) {
                if (0 === q) switch (2 * x + 3 * K) {
                  case 533:
                    break;

                  default:
                    q = 1;
                }
                v++;
              }

              break;

            case 64:
              0 === b + v + n + m + u + k && (k = 1);
              break;

            case 42:
            case 47:
              if (!(0 < n + m + v)) switch (b) {
                case 0:
                  switch (2 * g + 3 * e.charCodeAt(l + 1)) {
                    case 235:
                      b = 47;
                      break;

                    case 220:
                      t = l, b = 42;
                  }

                  break;

                case 42:
                  47 === g && 42 === x && t + 2 !== l && (33 === e.charCodeAt(t + 2) && (p += e.substring(t, l + 1)), y = '', b = 0);
              }
          }

          0 === b && (f += y);
      }

      K = x;
      x = g;
      l++;
    }

    t = p.length;

    if (0 < t) {
      r = c;
      if (0 < A && (C = H(2, p, r, d, D, z, t, h, a, h), void 0 !== C && 0 === (p = C).length)) return G + p + F;
      p = r.join(',') + '{' + p + '}';

      if (0 !== w * E) {
        2 !== w || L(p, 2) || (E = 0);

        switch (E) {
          case 111:
            p = p.replace(ha, ':-moz-$1') + p;
            break;

          case 112:
            p = p.replace(Q, '::-webkit-input-$1') + p.replace(Q, '::-moz-$1') + p.replace(Q, ':-ms-input-$1') + p;
        }

        E = 0;
      }
    }

    return G + p + F;
  }

  function X(d, c, e) {
    var h = c.trim().split(ia);
    c = h;
    var a = h.length,
        m = d.length;

    switch (m) {
      case 0:
      case 1:
        var b = 0;

        for (d = 0 === m ? '' : d[0] + ' '; b < a; ++b) {
          c[b] = Z(d, c[b], e).trim();
        }

        break;

      default:
        var v = b = 0;

        for (c = []; b < a; ++b) {
          for (var n = 0; n < m; ++n) {
            c[v++] = Z(d[n] + ' ', h[b], e).trim();
          }
        }

    }

    return c;
  }

  function Z(d, c, e) {
    var h = c.charCodeAt(0);
    33 > h && (h = (c = c.trim()).charCodeAt(0));

    switch (h) {
      case 38:
        return c.replace(F, '$1' + d.trim());

      case 58:
        return d.trim() + c.replace(F, '$1' + d.trim());

      default:
        if (0 < 1 * e && 0 < c.indexOf('\f')) return c.replace(F, (58 === d.charCodeAt(0) ? '' : '$1') + d.trim());
    }

    return d + c;
  }

  function P(d, c, e, h) {
    var a = d + ';',
        m = 2 * c + 3 * e + 4 * h;

    if (944 === m) {
      d = a.indexOf(':', 9) + 1;
      var b = a.substring(d, a.length - 1).trim();
      b = a.substring(0, d).trim() + b + ';';
      return 1 === w || 2 === w && L(b, 1) ? '-webkit-' + b + b : b;
    }

    if (0 === w || 2 === w && !L(a, 1)) return a;

    switch (m) {
      case 1015:
        return 97 === a.charCodeAt(10) ? '-webkit-' + a + a : a;

      case 951:
        return 116 === a.charCodeAt(3) ? '-webkit-' + a + a : a;

      case 963:
        return 110 === a.charCodeAt(5) ? '-webkit-' + a + a : a;

      case 1009:
        if (100 !== a.charCodeAt(4)) break;

      case 969:
      case 942:
        return '-webkit-' + a + a;

      case 978:
        return '-webkit-' + a + '-moz-' + a + a;

      case 1019:
      case 983:
        return '-webkit-' + a + '-moz-' + a + '-ms-' + a + a;

      case 883:
        if (45 === a.charCodeAt(8)) return '-webkit-' + a + a;
        if (0 < a.indexOf('image-set(', 11)) return a.replace(ja, '$1-webkit-$2') + a;
        break;

      case 932:
        if (45 === a.charCodeAt(4)) switch (a.charCodeAt(5)) {
          case 103:
            return '-webkit-box-' + a.replace('-grow', '') + '-webkit-' + a + '-ms-' + a.replace('grow', 'positive') + a;

          case 115:
            return '-webkit-' + a + '-ms-' + a.replace('shrink', 'negative') + a;

          case 98:
            return '-webkit-' + a + '-ms-' + a.replace('basis', 'preferred-size') + a;
        }
        return '-webkit-' + a + '-ms-' + a + a;

      case 964:
        return '-webkit-' + a + '-ms-flex-' + a + a;

      case 1023:
        if (99 !== a.charCodeAt(8)) break;
        b = a.substring(a.indexOf(':', 15)).replace('flex-', '').replace('space-between', 'justify');
        return '-webkit-box-pack' + b + '-webkit-' + a + '-ms-flex-pack' + b + a;

      case 1005:
        return ka.test(a) ? a.replace(aa, ':-webkit-') + a.replace(aa, ':-moz-') + a : a;

      case 1e3:
        b = a.substring(13).trim();
        c = b.indexOf('-') + 1;

        switch (b.charCodeAt(0) + b.charCodeAt(c)) {
          case 226:
            b = a.replace(G, 'tb');
            break;

          case 232:
            b = a.replace(G, 'tb-rl');
            break;

          case 220:
            b = a.replace(G, 'lr');
            break;

          default:
            return a;
        }

        return '-webkit-' + a + '-ms-' + b + a;

      case 1017:
        if (-1 === a.indexOf('sticky', 9)) break;

      case 975:
        c = (a = d).length - 10;
        b = (33 === a.charCodeAt(c) ? a.substring(0, c) : a).substring(d.indexOf(':', 7) + 1).trim();

        switch (m = b.charCodeAt(0) + (b.charCodeAt(7) | 0)) {
          case 203:
            if (111 > b.charCodeAt(8)) break;

          case 115:
            a = a.replace(b, '-webkit-' + b) + ';' + a;
            break;

          case 207:
          case 102:
            a = a.replace(b, '-webkit-' + (102 < m ? 'inline-' : '') + 'box') + ';' + a.replace(b, '-webkit-' + b) + ';' + a.replace(b, '-ms-' + b + 'box') + ';' + a;
        }

        return a + ';';

      case 938:
        if (45 === a.charCodeAt(5)) switch (a.charCodeAt(6)) {
          case 105:
            return b = a.replace('-items', ''), '-webkit-' + a + '-webkit-box-' + b + '-ms-flex-' + b + a;

          case 115:
            return '-webkit-' + a + '-ms-flex-item-' + a.replace(ba, '') + a;

          default:
            return '-webkit-' + a + '-ms-flex-line-pack' + a.replace('align-content', '').replace(ba, '') + a;
        }
        break;

      case 973:
      case 989:
        if (45 !== a.charCodeAt(3) || 122 === a.charCodeAt(4)) break;

      case 931:
      case 953:
        if (!0 === la.test(d)) return 115 === (b = d.substring(d.indexOf(':') + 1)).charCodeAt(0) ? P(d.replace('stretch', 'fill-available'), c, e, h).replace(':fill-available', ':stretch') : a.replace(b, '-webkit-' + b) + a.replace(b, '-moz-' + b.replace('fill-', '')) + a;
        break;

      case 962:
        if (a = '-webkit-' + a + (102 === a.charCodeAt(5) ? '-ms-' + a : '') + a, 211 === e + h && 105 === a.charCodeAt(13) && 0 < a.indexOf('transform', 10)) return a.substring(0, a.indexOf(';', 27) + 1).replace(ma, '$1-webkit-$2') + a;
    }

    return a;
  }

  function L(d, c) {
    var e = d.indexOf(1 === c ? ':' : '{'),
        h = d.substring(0, 3 !== c ? e : 10);
    e = d.substring(e + 1, d.length - 1);
    return R(2 !== c ? h : h.replace(na, '$1'), e, c);
  }

  function ea(d, c) {
    var e = P(c, c.charCodeAt(0), c.charCodeAt(1), c.charCodeAt(2));
    return e !== c + ';' ? e.replace(oa, ' or ($1)').substring(4) : '(' + c + ')';
  }

  function H(d, c, e, h, a, m, b, v, n, q) {
    for (var g = 0, x = c, w; g < A; ++g) {
      switch (w = S[g].call(B, d, x, e, h, a, m, b, v, n, q)) {
        case void 0:
        case !1:
        case !0:
        case null:
          break;

        default:
          x = w;
      }
    }

    if (x !== c) return x;
  }

  function T(d) {
    switch (d) {
      case void 0:
      case null:
        A = S.length = 0;
        break;

      default:
        if ('function' === typeof d) S[A++] = d;else if ('object' === typeof d) for (var c = 0, e = d.length; c < e; ++c) {
          T(d[c]);
        } else Y = !!d | 0;
    }

    return T;
  }

  function U(d) {
    d = d.prefix;
    void 0 !== d && (R = null, d ? 'function' !== typeof d ? w = 1 : (w = 2, R = d) : w = 0);
    return U;
  }

  function B(d, c) {
    var e = d;
    33 > e.charCodeAt(0) && (e = e.trim());
    V = e;
    e = [V];

    if (0 < A) {
      var h = H(-1, c, e, e, D, z, 0, 0, 0, 0);
      void 0 !== h && 'string' === typeof h && (c = h);
    }

    var a = M(O, e, c, 0, 0);
    0 < A && (h = H(-2, a, e, e, D, z, a.length, 0, 0, 0), void 0 !== h && (a = h));
    V = '';
    E = 0;
    z = D = 1;
    return a;
  }

  var ca = /^\0+/g,
      N = /[\0\r\f]/g,
      aa = /: */g,
      ka = /zoo|gra/,
      ma = /([,: ])(transform)/g,
      ia = /,\r+?/g,
      F = /([\t\r\n ])*\f?&/g,
      fa = /@(k\w+)\s*(\S*)\s*/,
      Q = /::(place)/g,
      ha = /:(read-only)/g,
      G = /[svh]\w+-[tblr]{2}/,
      da = /\(\s*(.*)\s*\)/g,
      oa = /([\s\S]*?);/g,
      ba = /-self|flex-/g,
      na = /[^]*?(:[rp][el]a[\w-]+)[^]*/,
      la = /stretch|:\s*\w+\-(?:conte|avail)/,
      ja = /([^-])(image-set\()/,
      z = 1,
      D = 1,
      E = 0,
      w = 1,
      O = [],
      S = [],
      A = 0,
      R = null,
      Y = 0,
      V = '';
  B.use = T;
  B.set = U;
  void 0 !== W && U(W);
  return B;
}

exports.default = stylis_min;

},{}],7:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var unitlessKeys = {
  animationIterationCount: 1,
  borderImageOutset: 1,
  borderImageSlice: 1,
  borderImageWidth: 1,
  boxFlex: 1,
  boxFlexGroup: 1,
  boxOrdinalGroup: 1,
  columnCount: 1,
  columns: 1,
  flex: 1,
  flexGrow: 1,
  flexPositive: 1,
  flexShrink: 1,
  flexNegative: 1,
  flexOrder: 1,
  gridRow: 1,
  gridRowEnd: 1,
  gridRowSpan: 1,
  gridRowStart: 1,
  gridColumn: 1,
  gridColumnEnd: 1,
  gridColumnSpan: 1,
  gridColumnStart: 1,
  msGridRow: 1,
  msGridRowSpan: 1,
  msGridColumn: 1,
  msGridColumnSpan: 1,
  fontWeight: 1,
  lineHeight: 1,
  opacity: 1,
  order: 1,
  orphans: 1,
  tabSize: 1,
  widows: 1,
  zIndex: 1,
  zoom: 1,
  WebkitLineClamp: 1,
  // SVG-related properties
  fillOpacity: 1,
  floodOpacity: 1,
  stopOpacity: 1,
  strokeDasharray: 1,
  strokeDashoffset: 1,
  strokeMiterlimit: 1,
  strokeOpacity: 1,
  strokeWidth: 1
};

exports.default = unitlessKeys;

},{}],8:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var isBrowser = "object" !== 'undefined';
function getRegisteredStyles(registered, registeredStyles, classNames) {
  var rawClassName = '';
  classNames.split(' ').forEach(function (className) {
    if (registered[className] !== undefined) {
      registeredStyles.push(registered[className]);
    } else {
      rawClassName += className + " ";
    }
  });
  return rawClassName;
}
var insertStyles = function insertStyles(cache, serialized, isStringTag) {
  var className = cache.key + "-" + serialized.name;

  if ( // we only need to add the styles to the registered cache if the
  // class name could be used further down
  // the tree but if it's a string tag, we know it won't
  // so we don't have to add it to registered cache.
  // this improves memory usage since we can avoid storing the whole style string
  (isStringTag === false || // we need to always store it if we're in compat mode and
  // in node since emotion-server relies on whether a style is in
  // the registered cache to know whether a style is global or not
  // also, note that this check will be dead code eliminated in the browser
  isBrowser === false && cache.compat !== undefined) && cache.registered[className] === undefined) {
    cache.registered[className] = serialized.styles;
  }

  if (cache.inserted[serialized.name] === undefined) {
    var current = serialized;

    do {
      var maybeStyles = cache.insert("." + className, current, cache.sheet, true);

      current = current.next;
    } while (current !== undefined);
  }
};

exports.getRegisteredStyles = getRegisteredStyles;
exports.insertStyles = insertStyles;

},{}],9:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var weakMemoize = function weakMemoize(func) {
  // $FlowFixMe flow doesn't include all non-primitive types as allowed for weakmaps
  var cache = new WeakMap();
  return function (arg) {
    if (cache.has(arg)) {
      // $FlowFixMe
      return cache.get(arg);
    }

    var ret = func(arg);
    cache.set(arg, ret);
    return ret;
  };
};

exports.default = weakMemoize;

},{}],10:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var createCache = _interopDefault(require('@emotion/cache'));
var serialize = require('@emotion/serialize');
var utils = require('@emotion/utils');

function insertWithoutScoping(cache, serialized) {
  if (cache.inserted[serialized.name] === undefined) {
    return cache.insert('', serialized, cache.sheet, true);
  }
}

function merge(registered, css, className) {
  var registeredStyles = [];
  var rawClassName = utils.getRegisteredStyles(registered, registeredStyles, className);

  if (registeredStyles.length < 2) {
    return className;
  }

  return rawClassName + css(registeredStyles);
}

var createEmotion = function createEmotion(options) {
  var cache = createCache(options); // $FlowFixMe

  cache.sheet.speedy = function (value) {
    if ("production" !== 'production' && this.ctr !== 0) {
      throw new Error('speedy must be changed before any rules are inserted');
    }

    this.isSpeedy = value;
  };

  cache.compat = true;

  var css = function css() {
    for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }

    var serialized = serialize.serializeStyles(args, cache.registered, undefined);
    utils.insertStyles(cache, serialized, false);
    return cache.key + "-" + serialized.name;
  };

  var keyframes = function keyframes() {
    for (var _len2 = arguments.length, args = new Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
      args[_key2] = arguments[_key2];
    }

    var serialized = serialize.serializeStyles(args, cache.registered);
    var animation = "animation-" + serialized.name;
    insertWithoutScoping(cache, {
      name: serialized.name,
      styles: "@keyframes " + animation + "{" + serialized.styles + "}"
    });
    return animation;
  };

  var injectGlobal = function injectGlobal() {
    for (var _len3 = arguments.length, args = new Array(_len3), _key3 = 0; _key3 < _len3; _key3++) {
      args[_key3] = arguments[_key3];
    }

    var serialized = serialize.serializeStyles(args, cache.registered);
    insertWithoutScoping(cache, serialized);
  };

  var cx = function cx() {
    for (var _len4 = arguments.length, args = new Array(_len4), _key4 = 0; _key4 < _len4; _key4++) {
      args[_key4] = arguments[_key4];
    }

    return merge(cache.registered, css, classnames(args));
  };

  return {
    css: css,
    cx: cx,
    injectGlobal: injectGlobal,
    keyframes: keyframes,
    hydrate: function hydrate(ids) {
      ids.forEach(function (key) {
        cache.inserted[key] = true;
      });
    },
    flush: function flush() {
      cache.registered = {};
      cache.inserted = {};
      cache.sheet.flush();
    },
    // $FlowFixMe
    sheet: cache.sheet,
    cache: cache,
    getRegisteredStyles: utils.getRegisteredStyles.bind(null, cache.registered),
    merge: merge.bind(null, cache.registered, css)
  };
};

var classnames = function classnames(args) {
  var cls = '';

  for (var i = 0; i < args.length; i++) {
    var arg = args[i];
    if (arg == null) continue;
    var toAdd = void 0;

    switch (typeof arg) {
      case 'boolean':
        break;

      case 'object':
        {
          if (Array.isArray(arg)) {
            toAdd = classnames(arg);
          } else {
            toAdd = '';

            for (var k in arg) {
              if (arg[k] && k) {
                toAdd && (toAdd += ' ');
                toAdd += k;
              }
            }
          }

          break;
        }

      default:
        {
          toAdd = arg;
        }
    }

    if (toAdd) {
      cls && (cls += ' ');
      cls += toAdd;
    }
  }

  return cls;
};

exports.default = createEmotion;

},{"@emotion/cache":1,"@emotion/serialize":4,"@emotion/utils":8}],11:[function(require,module,exports){
'use strict';

if ("production" === "production") {
  module.exports = require("./emotion.cjs.prod.js");
} else {
  module.exports = null;
}

},{"./emotion.cjs.prod.js":12}],12:[function(require,module,exports){
"use strict";

function _interopDefault(ex) {
  return ex && "object" == typeof ex && "default" in ex ? ex.default : ex;
}

Object.defineProperty(exports, "__esModule", {
  value: !0
});

var createEmotion = _interopDefault(require("create-emotion")), _createEmotion = createEmotion(), flush = _createEmotion.flush, hydrate = _createEmotion.hydrate, cx = _createEmotion.cx, merge = _createEmotion.merge, getRegisteredStyles = _createEmotion.getRegisteredStyles, injectGlobal = _createEmotion.injectGlobal, keyframes = _createEmotion.keyframes, css = _createEmotion.css, sheet = _createEmotion.sheet, cache = _createEmotion.cache;

exports.cache = cache, exports.css = css, exports.cx = cx, exports.flush = flush, 
exports.getRegisteredStyles = getRegisteredStyles, exports.hydrate = hydrate, exports.injectGlobal = injectGlobal, 
exports.keyframes = keyframes, exports.merge = merge, exports.sheet = sheet;

},{"create-emotion":10}],13:[function(require,module,exports){
/*
object-assign
(c) Sindre Sorhus
@license MIT
*/

'use strict';
/* eslint-disable no-unused-vars */
var getOwnPropertySymbols = Object.getOwnPropertySymbols;
var hasOwnProperty = Object.prototype.hasOwnProperty;
var propIsEnumerable = Object.prototype.propertyIsEnumerable;

function toObject(val) {
	if (val === null || val === undefined) {
		throw new TypeError('Object.assign cannot be called with null or undefined');
	}

	return Object(val);
}

function shouldUseNative() {
	try {
		if (!Object.assign) {
			return false;
		}

		// Detect buggy property enumeration order in older V8 versions.

		// https://bugs.chromium.org/p/v8/issues/detail?id=4118
		var test1 = new String('abc');  // eslint-disable-line no-new-wrappers
		test1[5] = 'de';
		if (Object.getOwnPropertyNames(test1)[0] === '5') {
			return false;
		}

		// https://bugs.chromium.org/p/v8/issues/detail?id=3056
		var test2 = {};
		for (var i = 0; i < 10; i++) {
			test2['_' + String.fromCharCode(i)] = i;
		}
		var order2 = Object.getOwnPropertyNames(test2).map(function (n) {
			return test2[n];
		});
		if (order2.join('') !== '0123456789') {
			return false;
		}

		// https://bugs.chromium.org/p/v8/issues/detail?id=3056
		var test3 = {};
		'abcdefghijklmnopqrst'.split('').forEach(function (letter) {
			test3[letter] = letter;
		});
		if (Object.keys(Object.assign({}, test3)).join('') !==
				'abcdefghijklmnopqrst') {
			return false;
		}

		return true;
	} catch (err) {
		// We don't expect any of the above to throw, but better to be safe.
		return false;
	}
}

module.exports = shouldUseNative() ? Object.assign : function (target, source) {
	var from;
	var to = toObject(target);
	var symbols;

	for (var s = 1; s < arguments.length; s++) {
		from = Object(arguments[s]);

		for (var key in from) {
			if (hasOwnProperty.call(from, key)) {
				to[key] = from[key];
			}
		}

		if (getOwnPropertySymbols) {
			symbols = getOwnPropertySymbols(from);
			for (var i = 0; i < symbols.length; i++) {
				if (propIsEnumerable.call(from, symbols[i])) {
					to[symbols[i]] = from[symbols[i]];
				}
			}
		}
	}

	return to;
};

},{}],14:[function(require,module,exports){
/** @license React v16.13.1
 * react-dom.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/*
 Modernizr 3.0.0pre (Custom Build) | MIT
*/
'use strict';var aa=require("react"),n=require("object-assign"),r=require("scheduler");function u(a){for(var b="https://reactjs.org/docs/error-decoder.html?invariant="+a,c=1;c<arguments.length;c++)b+="&args[]="+encodeURIComponent(arguments[c]);return"Minified React error #"+a+"; visit "+b+" for the full message or use the non-minified dev environment for full errors and additional helpful warnings."}if(!aa)throw Error(u(227));
function ba(a,b,c,d,e,f,g,h,k){var l=Array.prototype.slice.call(arguments,3);try{b.apply(c,l)}catch(m){this.onError(m)}}var da=!1,ea=null,fa=!1,ha=null,ia={onError:function(a){da=!0;ea=a}};function ja(a,b,c,d,e,f,g,h,k){da=!1;ea=null;ba.apply(ia,arguments)}function ka(a,b,c,d,e,f,g,h,k){ja.apply(this,arguments);if(da){if(da){var l=ea;da=!1;ea=null}else throw Error(u(198));fa||(fa=!0,ha=l)}}var la=null,ma=null,na=null;
function oa(a,b,c){var d=a.type||"unknown-event";a.currentTarget=na(c);ka(d,b,void 0,a);a.currentTarget=null}var pa=null,qa={};
function ra(){if(pa)for(var a in qa){var b=qa[a],c=pa.indexOf(a);if(!(-1<c))throw Error(u(96,a));if(!sa[c]){if(!b.extractEvents)throw Error(u(97,a));sa[c]=b;c=b.eventTypes;for(var d in c){var e=void 0;var f=c[d],g=b,h=d;if(ta.hasOwnProperty(h))throw Error(u(99,h));ta[h]=f;var k=f.phasedRegistrationNames;if(k){for(e in k)k.hasOwnProperty(e)&&ua(k[e],g,h);e=!0}else f.registrationName?(ua(f.registrationName,g,h),e=!0):e=!1;if(!e)throw Error(u(98,d,a));}}}}
function ua(a,b,c){if(va[a])throw Error(u(100,a));va[a]=b;wa[a]=b.eventTypes[c].dependencies}var sa=[],ta={},va={},wa={};function xa(a){var b=!1,c;for(c in a)if(a.hasOwnProperty(c)){var d=a[c];if(!qa.hasOwnProperty(c)||qa[c]!==d){if(qa[c])throw Error(u(102,c));qa[c]=d;b=!0}}b&&ra()}var ya=!("undefined"===typeof window||"undefined"===typeof window.document||"undefined"===typeof window.document.createElement),za=null,Aa=null,Ba=null;
function Ca(a){if(a=ma(a)){if("function"!==typeof za)throw Error(u(280));var b=a.stateNode;b&&(b=la(b),za(a.stateNode,a.type,b))}}function Da(a){Aa?Ba?Ba.push(a):Ba=[a]:Aa=a}function Ea(){if(Aa){var a=Aa,b=Ba;Ba=Aa=null;Ca(a);if(b)for(a=0;a<b.length;a++)Ca(b[a])}}function Fa(a,b){return a(b)}function Ga(a,b,c,d,e){return a(b,c,d,e)}function Ha(){}var Ia=Fa,Ja=!1,Ka=!1;function La(){if(null!==Aa||null!==Ba)Ha(),Ea()}
function Ma(a,b,c){if(Ka)return a(b,c);Ka=!0;try{return Ia(a,b,c)}finally{Ka=!1,La()}}var Na=/^[:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD][:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*$/,Oa=Object.prototype.hasOwnProperty,Pa={},Qa={};
function Ra(a){if(Oa.call(Qa,a))return!0;if(Oa.call(Pa,a))return!1;if(Na.test(a))return Qa[a]=!0;Pa[a]=!0;return!1}function Sa(a,b,c,d){if(null!==c&&0===c.type)return!1;switch(typeof b){case "function":case "symbol":return!0;case "boolean":if(d)return!1;if(null!==c)return!c.acceptsBooleans;a=a.toLowerCase().slice(0,5);return"data-"!==a&&"aria-"!==a;default:return!1}}
function Ta(a,b,c,d){if(null===b||"undefined"===typeof b||Sa(a,b,c,d))return!0;if(d)return!1;if(null!==c)switch(c.type){case 3:return!b;case 4:return!1===b;case 5:return isNaN(b);case 6:return isNaN(b)||1>b}return!1}function v(a,b,c,d,e,f){this.acceptsBooleans=2===b||3===b||4===b;this.attributeName=d;this.attributeNamespace=e;this.mustUseProperty=c;this.propertyName=a;this.type=b;this.sanitizeURL=f}var C={};
"children dangerouslySetInnerHTML defaultValue defaultChecked innerHTML suppressContentEditableWarning suppressHydrationWarning style".split(" ").forEach(function(a){C[a]=new v(a,0,!1,a,null,!1)});[["acceptCharset","accept-charset"],["className","class"],["htmlFor","for"],["httpEquiv","http-equiv"]].forEach(function(a){var b=a[0];C[b]=new v(b,1,!1,a[1],null,!1)});["contentEditable","draggable","spellCheck","value"].forEach(function(a){C[a]=new v(a,2,!1,a.toLowerCase(),null,!1)});
["autoReverse","externalResourcesRequired","focusable","preserveAlpha"].forEach(function(a){C[a]=new v(a,2,!1,a,null,!1)});"allowFullScreen async autoFocus autoPlay controls default defer disabled disablePictureInPicture formNoValidate hidden loop noModule noValidate open playsInline readOnly required reversed scoped seamless itemScope".split(" ").forEach(function(a){C[a]=new v(a,3,!1,a.toLowerCase(),null,!1)});
["checked","multiple","muted","selected"].forEach(function(a){C[a]=new v(a,3,!0,a,null,!1)});["capture","download"].forEach(function(a){C[a]=new v(a,4,!1,a,null,!1)});["cols","rows","size","span"].forEach(function(a){C[a]=new v(a,6,!1,a,null,!1)});["rowSpan","start"].forEach(function(a){C[a]=new v(a,5,!1,a.toLowerCase(),null,!1)});var Ua=/[\-:]([a-z])/g;function Va(a){return a[1].toUpperCase()}
"accent-height alignment-baseline arabic-form baseline-shift cap-height clip-path clip-rule color-interpolation color-interpolation-filters color-profile color-rendering dominant-baseline enable-background fill-opacity fill-rule flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight glyph-name glyph-orientation-horizontal glyph-orientation-vertical horiz-adv-x horiz-origin-x image-rendering letter-spacing lighting-color marker-end marker-mid marker-start overline-position overline-thickness paint-order panose-1 pointer-events rendering-intent shape-rendering stop-color stop-opacity strikethrough-position strikethrough-thickness stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-width text-anchor text-decoration text-rendering underline-position underline-thickness unicode-bidi unicode-range units-per-em v-alphabetic v-hanging v-ideographic v-mathematical vector-effect vert-adv-y vert-origin-x vert-origin-y word-spacing writing-mode xmlns:xlink x-height".split(" ").forEach(function(a){var b=a.replace(Ua,
Va);C[b]=new v(b,1,!1,a,null,!1)});"xlink:actuate xlink:arcrole xlink:role xlink:show xlink:title xlink:type".split(" ").forEach(function(a){var b=a.replace(Ua,Va);C[b]=new v(b,1,!1,a,"http://www.w3.org/1999/xlink",!1)});["xml:base","xml:lang","xml:space"].forEach(function(a){var b=a.replace(Ua,Va);C[b]=new v(b,1,!1,a,"http://www.w3.org/XML/1998/namespace",!1)});["tabIndex","crossOrigin"].forEach(function(a){C[a]=new v(a,1,!1,a.toLowerCase(),null,!1)});
C.xlinkHref=new v("xlinkHref",1,!1,"xlink:href","http://www.w3.org/1999/xlink",!0);["src","href","action","formAction"].forEach(function(a){C[a]=new v(a,1,!1,a.toLowerCase(),null,!0)});var Wa=aa.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;Wa.hasOwnProperty("ReactCurrentDispatcher")||(Wa.ReactCurrentDispatcher={current:null});Wa.hasOwnProperty("ReactCurrentBatchConfig")||(Wa.ReactCurrentBatchConfig={suspense:null});
function Xa(a,b,c,d){var e=C.hasOwnProperty(b)?C[b]:null;var f=null!==e?0===e.type:d?!1:!(2<b.length)||"o"!==b[0]&&"O"!==b[0]||"n"!==b[1]&&"N"!==b[1]?!1:!0;f||(Ta(b,c,e,d)&&(c=null),d||null===e?Ra(b)&&(null===c?a.removeAttribute(b):a.setAttribute(b,""+c)):e.mustUseProperty?a[e.propertyName]=null===c?3===e.type?!1:"":c:(b=e.attributeName,d=e.attributeNamespace,null===c?a.removeAttribute(b):(e=e.type,c=3===e||4===e&&!0===c?"":""+c,d?a.setAttributeNS(d,b,c):a.setAttribute(b,c))))}
var Ya=/^(.*)[\\\/]/,E="function"===typeof Symbol&&Symbol.for,Za=E?Symbol.for("react.element"):60103,$a=E?Symbol.for("react.portal"):60106,ab=E?Symbol.for("react.fragment"):60107,bb=E?Symbol.for("react.strict_mode"):60108,cb=E?Symbol.for("react.profiler"):60114,db=E?Symbol.for("react.provider"):60109,eb=E?Symbol.for("react.context"):60110,fb=E?Symbol.for("react.concurrent_mode"):60111,gb=E?Symbol.for("react.forward_ref"):60112,hb=E?Symbol.for("react.suspense"):60113,ib=E?Symbol.for("react.suspense_list"):
60120,jb=E?Symbol.for("react.memo"):60115,kb=E?Symbol.for("react.lazy"):60116,lb=E?Symbol.for("react.block"):60121,mb="function"===typeof Symbol&&Symbol.iterator;function nb(a){if(null===a||"object"!==typeof a)return null;a=mb&&a[mb]||a["@@iterator"];return"function"===typeof a?a:null}function ob(a){if(-1===a._status){a._status=0;var b=a._ctor;b=b();a._result=b;b.then(function(b){0===a._status&&(b=b.default,a._status=1,a._result=b)},function(b){0===a._status&&(a._status=2,a._result=b)})}}
function pb(a){if(null==a)return null;if("function"===typeof a)return a.displayName||a.name||null;if("string"===typeof a)return a;switch(a){case ab:return"Fragment";case $a:return"Portal";case cb:return"Profiler";case bb:return"StrictMode";case hb:return"Suspense";case ib:return"SuspenseList"}if("object"===typeof a)switch(a.$$typeof){case eb:return"Context.Consumer";case db:return"Context.Provider";case gb:var b=a.render;b=b.displayName||b.name||"";return a.displayName||(""!==b?"ForwardRef("+b+")":
"ForwardRef");case jb:return pb(a.type);case lb:return pb(a.render);case kb:if(a=1===a._status?a._result:null)return pb(a)}return null}function qb(a){var b="";do{a:switch(a.tag){case 3:case 4:case 6:case 7:case 10:case 9:var c="";break a;default:var d=a._debugOwner,e=a._debugSource,f=pb(a.type);c=null;d&&(c=pb(d.type));d=f;f="";e?f=" (at "+e.fileName.replace(Ya,"")+":"+e.lineNumber+")":c&&(f=" (created by "+c+")");c="\n    in "+(d||"Unknown")+f}b+=c;a=a.return}while(a);return b}
function rb(a){switch(typeof a){case "boolean":case "number":case "object":case "string":case "undefined":return a;default:return""}}function sb(a){var b=a.type;return(a=a.nodeName)&&"input"===a.toLowerCase()&&("checkbox"===b||"radio"===b)}
function tb(a){var b=sb(a)?"checked":"value",c=Object.getOwnPropertyDescriptor(a.constructor.prototype,b),d=""+a[b];if(!a.hasOwnProperty(b)&&"undefined"!==typeof c&&"function"===typeof c.get&&"function"===typeof c.set){var e=c.get,f=c.set;Object.defineProperty(a,b,{configurable:!0,get:function(){return e.call(this)},set:function(a){d=""+a;f.call(this,a)}});Object.defineProperty(a,b,{enumerable:c.enumerable});return{getValue:function(){return d},setValue:function(a){d=""+a},stopTracking:function(){a._valueTracker=
null;delete a[b]}}}}function xb(a){a._valueTracker||(a._valueTracker=tb(a))}function yb(a){if(!a)return!1;var b=a._valueTracker;if(!b)return!0;var c=b.getValue();var d="";a&&(d=sb(a)?a.checked?"true":"false":a.value);a=d;return a!==c?(b.setValue(a),!0):!1}function zb(a,b){var c=b.checked;return n({},b,{defaultChecked:void 0,defaultValue:void 0,value:void 0,checked:null!=c?c:a._wrapperState.initialChecked})}
function Ab(a,b){var c=null==b.defaultValue?"":b.defaultValue,d=null!=b.checked?b.checked:b.defaultChecked;c=rb(null!=b.value?b.value:c);a._wrapperState={initialChecked:d,initialValue:c,controlled:"checkbox"===b.type||"radio"===b.type?null!=b.checked:null!=b.value}}function Bb(a,b){b=b.checked;null!=b&&Xa(a,"checked",b,!1)}
function Cb(a,b){Bb(a,b);var c=rb(b.value),d=b.type;if(null!=c)if("number"===d){if(0===c&&""===a.value||a.value!=c)a.value=""+c}else a.value!==""+c&&(a.value=""+c);else if("submit"===d||"reset"===d){a.removeAttribute("value");return}b.hasOwnProperty("value")?Db(a,b.type,c):b.hasOwnProperty("defaultValue")&&Db(a,b.type,rb(b.defaultValue));null==b.checked&&null!=b.defaultChecked&&(a.defaultChecked=!!b.defaultChecked)}
function Eb(a,b,c){if(b.hasOwnProperty("value")||b.hasOwnProperty("defaultValue")){var d=b.type;if(!("submit"!==d&&"reset"!==d||void 0!==b.value&&null!==b.value))return;b=""+a._wrapperState.initialValue;c||b===a.value||(a.value=b);a.defaultValue=b}c=a.name;""!==c&&(a.name="");a.defaultChecked=!!a._wrapperState.initialChecked;""!==c&&(a.name=c)}
function Db(a,b,c){if("number"!==b||a.ownerDocument.activeElement!==a)null==c?a.defaultValue=""+a._wrapperState.initialValue:a.defaultValue!==""+c&&(a.defaultValue=""+c)}function Fb(a){var b="";aa.Children.forEach(a,function(a){null!=a&&(b+=a)});return b}function Gb(a,b){a=n({children:void 0},b);if(b=Fb(b.children))a.children=b;return a}
function Hb(a,b,c,d){a=a.options;if(b){b={};for(var e=0;e<c.length;e++)b["$"+c[e]]=!0;for(c=0;c<a.length;c++)e=b.hasOwnProperty("$"+a[c].value),a[c].selected!==e&&(a[c].selected=e),e&&d&&(a[c].defaultSelected=!0)}else{c=""+rb(c);b=null;for(e=0;e<a.length;e++){if(a[e].value===c){a[e].selected=!0;d&&(a[e].defaultSelected=!0);return}null!==b||a[e].disabled||(b=a[e])}null!==b&&(b.selected=!0)}}
function Ib(a,b){if(null!=b.dangerouslySetInnerHTML)throw Error(u(91));return n({},b,{value:void 0,defaultValue:void 0,children:""+a._wrapperState.initialValue})}function Jb(a,b){var c=b.value;if(null==c){c=b.children;b=b.defaultValue;if(null!=c){if(null!=b)throw Error(u(92));if(Array.isArray(c)){if(!(1>=c.length))throw Error(u(93));c=c[0]}b=c}null==b&&(b="");c=b}a._wrapperState={initialValue:rb(c)}}
function Kb(a,b){var c=rb(b.value),d=rb(b.defaultValue);null!=c&&(c=""+c,c!==a.value&&(a.value=c),null==b.defaultValue&&a.defaultValue!==c&&(a.defaultValue=c));null!=d&&(a.defaultValue=""+d)}function Lb(a){var b=a.textContent;b===a._wrapperState.initialValue&&""!==b&&null!==b&&(a.value=b)}var Mb={html:"http://www.w3.org/1999/xhtml",mathml:"http://www.w3.org/1998/Math/MathML",svg:"http://www.w3.org/2000/svg"};
function Nb(a){switch(a){case "svg":return"http://www.w3.org/2000/svg";case "math":return"http://www.w3.org/1998/Math/MathML";default:return"http://www.w3.org/1999/xhtml"}}function Ob(a,b){return null==a||"http://www.w3.org/1999/xhtml"===a?Nb(b):"http://www.w3.org/2000/svg"===a&&"foreignObject"===b?"http://www.w3.org/1999/xhtml":a}
var Pb,Qb=function(a){return"undefined"!==typeof MSApp&&MSApp.execUnsafeLocalFunction?function(b,c,d,e){MSApp.execUnsafeLocalFunction(function(){return a(b,c,d,e)})}:a}(function(a,b){if(a.namespaceURI!==Mb.svg||"innerHTML"in a)a.innerHTML=b;else{Pb=Pb||document.createElement("div");Pb.innerHTML="<svg>"+b.valueOf().toString()+"</svg>";for(b=Pb.firstChild;a.firstChild;)a.removeChild(a.firstChild);for(;b.firstChild;)a.appendChild(b.firstChild)}});
function Rb(a,b){if(b){var c=a.firstChild;if(c&&c===a.lastChild&&3===c.nodeType){c.nodeValue=b;return}}a.textContent=b}function Sb(a,b){var c={};c[a.toLowerCase()]=b.toLowerCase();c["Webkit"+a]="webkit"+b;c["Moz"+a]="moz"+b;return c}var Tb={animationend:Sb("Animation","AnimationEnd"),animationiteration:Sb("Animation","AnimationIteration"),animationstart:Sb("Animation","AnimationStart"),transitionend:Sb("Transition","TransitionEnd")},Ub={},Vb={};
ya&&(Vb=document.createElement("div").style,"AnimationEvent"in window||(delete Tb.animationend.animation,delete Tb.animationiteration.animation,delete Tb.animationstart.animation),"TransitionEvent"in window||delete Tb.transitionend.transition);function Wb(a){if(Ub[a])return Ub[a];if(!Tb[a])return a;var b=Tb[a],c;for(c in b)if(b.hasOwnProperty(c)&&c in Vb)return Ub[a]=b[c];return a}
var Xb=Wb("animationend"),Yb=Wb("animationiteration"),Zb=Wb("animationstart"),$b=Wb("transitionend"),ac="abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange seeked seeking stalled suspend timeupdate volumechange waiting".split(" "),bc=new ("function"===typeof WeakMap?WeakMap:Map);function cc(a){var b=bc.get(a);void 0===b&&(b=new Map,bc.set(a,b));return b}
function dc(a){var b=a,c=a;if(a.alternate)for(;b.return;)b=b.return;else{a=b;do b=a,0!==(b.effectTag&1026)&&(c=b.return),a=b.return;while(a)}return 3===b.tag?c:null}function ec(a){if(13===a.tag){var b=a.memoizedState;null===b&&(a=a.alternate,null!==a&&(b=a.memoizedState));if(null!==b)return b.dehydrated}return null}function fc(a){if(dc(a)!==a)throw Error(u(188));}
function gc(a){var b=a.alternate;if(!b){b=dc(a);if(null===b)throw Error(u(188));return b!==a?null:a}for(var c=a,d=b;;){var e=c.return;if(null===e)break;var f=e.alternate;if(null===f){d=e.return;if(null!==d){c=d;continue}break}if(e.child===f.child){for(f=e.child;f;){if(f===c)return fc(e),a;if(f===d)return fc(e),b;f=f.sibling}throw Error(u(188));}if(c.return!==d.return)c=e,d=f;else{for(var g=!1,h=e.child;h;){if(h===c){g=!0;c=e;d=f;break}if(h===d){g=!0;d=e;c=f;break}h=h.sibling}if(!g){for(h=f.child;h;){if(h===
c){g=!0;c=f;d=e;break}if(h===d){g=!0;d=f;c=e;break}h=h.sibling}if(!g)throw Error(u(189));}}if(c.alternate!==d)throw Error(u(190));}if(3!==c.tag)throw Error(u(188));return c.stateNode.current===c?a:b}function hc(a){a=gc(a);if(!a)return null;for(var b=a;;){if(5===b.tag||6===b.tag)return b;if(b.child)b.child.return=b,b=b.child;else{if(b===a)break;for(;!b.sibling;){if(!b.return||b.return===a)return null;b=b.return}b.sibling.return=b.return;b=b.sibling}}return null}
function ic(a,b){if(null==b)throw Error(u(30));if(null==a)return b;if(Array.isArray(a)){if(Array.isArray(b))return a.push.apply(a,b),a;a.push(b);return a}return Array.isArray(b)?[a].concat(b):[a,b]}function jc(a,b,c){Array.isArray(a)?a.forEach(b,c):a&&b.call(c,a)}var kc=null;
function lc(a){if(a){var b=a._dispatchListeners,c=a._dispatchInstances;if(Array.isArray(b))for(var d=0;d<b.length&&!a.isPropagationStopped();d++)oa(a,b[d],c[d]);else b&&oa(a,b,c);a._dispatchListeners=null;a._dispatchInstances=null;a.isPersistent()||a.constructor.release(a)}}function mc(a){null!==a&&(kc=ic(kc,a));a=kc;kc=null;if(a){jc(a,lc);if(kc)throw Error(u(95));if(fa)throw a=ha,fa=!1,ha=null,a;}}
function nc(a){a=a.target||a.srcElement||window;a.correspondingUseElement&&(a=a.correspondingUseElement);return 3===a.nodeType?a.parentNode:a}function oc(a){if(!ya)return!1;a="on"+a;var b=a in document;b||(b=document.createElement("div"),b.setAttribute(a,"return;"),b="function"===typeof b[a]);return b}var pc=[];function qc(a){a.topLevelType=null;a.nativeEvent=null;a.targetInst=null;a.ancestors.length=0;10>pc.length&&pc.push(a)}
function rc(a,b,c,d){if(pc.length){var e=pc.pop();e.topLevelType=a;e.eventSystemFlags=d;e.nativeEvent=b;e.targetInst=c;return e}return{topLevelType:a,eventSystemFlags:d,nativeEvent:b,targetInst:c,ancestors:[]}}
function sc(a){var b=a.targetInst,c=b;do{if(!c){a.ancestors.push(c);break}var d=c;if(3===d.tag)d=d.stateNode.containerInfo;else{for(;d.return;)d=d.return;d=3!==d.tag?null:d.stateNode.containerInfo}if(!d)break;b=c.tag;5!==b&&6!==b||a.ancestors.push(c);c=tc(d)}while(c);for(c=0;c<a.ancestors.length;c++){b=a.ancestors[c];var e=nc(a.nativeEvent);d=a.topLevelType;var f=a.nativeEvent,g=a.eventSystemFlags;0===c&&(g|=64);for(var h=null,k=0;k<sa.length;k++){var l=sa[k];l&&(l=l.extractEvents(d,b,f,e,g))&&(h=
ic(h,l))}mc(h)}}function uc(a,b,c){if(!c.has(a)){switch(a){case "scroll":vc(b,"scroll",!0);break;case "focus":case "blur":vc(b,"focus",!0);vc(b,"blur",!0);c.set("blur",null);c.set("focus",null);break;case "cancel":case "close":oc(a)&&vc(b,a,!0);break;case "invalid":case "submit":case "reset":break;default:-1===ac.indexOf(a)&&F(a,b)}c.set(a,null)}}
var wc,xc,yc,zc=!1,Ac=[],Bc=null,Cc=null,Dc=null,Ec=new Map,Fc=new Map,Gc=[],Hc="mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput close cancel copy cut paste click change contextmenu reset submit".split(" "),Ic="focus blur dragenter dragleave mouseover mouseout pointerover pointerout gotpointercapture lostpointercapture".split(" ");
function Jc(a,b){var c=cc(b);Hc.forEach(function(a){uc(a,b,c)});Ic.forEach(function(a){uc(a,b,c)})}function Kc(a,b,c,d,e){return{blockedOn:a,topLevelType:b,eventSystemFlags:c|32,nativeEvent:e,container:d}}
function Lc(a,b){switch(a){case "focus":case "blur":Bc=null;break;case "dragenter":case "dragleave":Cc=null;break;case "mouseover":case "mouseout":Dc=null;break;case "pointerover":case "pointerout":Ec.delete(b.pointerId);break;case "gotpointercapture":case "lostpointercapture":Fc.delete(b.pointerId)}}function Mc(a,b,c,d,e,f){if(null===a||a.nativeEvent!==f)return a=Kc(b,c,d,e,f),null!==b&&(b=Nc(b),null!==b&&xc(b)),a;a.eventSystemFlags|=d;return a}
function Oc(a,b,c,d,e){switch(b){case "focus":return Bc=Mc(Bc,a,b,c,d,e),!0;case "dragenter":return Cc=Mc(Cc,a,b,c,d,e),!0;case "mouseover":return Dc=Mc(Dc,a,b,c,d,e),!0;case "pointerover":var f=e.pointerId;Ec.set(f,Mc(Ec.get(f)||null,a,b,c,d,e));return!0;case "gotpointercapture":return f=e.pointerId,Fc.set(f,Mc(Fc.get(f)||null,a,b,c,d,e)),!0}return!1}
function Pc(a){var b=tc(a.target);if(null!==b){var c=dc(b);if(null!==c)if(b=c.tag,13===b){if(b=ec(c),null!==b){a.blockedOn=b;r.unstable_runWithPriority(a.priority,function(){yc(c)});return}}else if(3===b&&c.stateNode.hydrate){a.blockedOn=3===c.tag?c.stateNode.containerInfo:null;return}}a.blockedOn=null}function Qc(a){if(null!==a.blockedOn)return!1;var b=Rc(a.topLevelType,a.eventSystemFlags,a.container,a.nativeEvent);if(null!==b){var c=Nc(b);null!==c&&xc(c);a.blockedOn=b;return!1}return!0}
function Sc(a,b,c){Qc(a)&&c.delete(b)}function Tc(){for(zc=!1;0<Ac.length;){var a=Ac[0];if(null!==a.blockedOn){a=Nc(a.blockedOn);null!==a&&wc(a);break}var b=Rc(a.topLevelType,a.eventSystemFlags,a.container,a.nativeEvent);null!==b?a.blockedOn=b:Ac.shift()}null!==Bc&&Qc(Bc)&&(Bc=null);null!==Cc&&Qc(Cc)&&(Cc=null);null!==Dc&&Qc(Dc)&&(Dc=null);Ec.forEach(Sc);Fc.forEach(Sc)}function Uc(a,b){a.blockedOn===b&&(a.blockedOn=null,zc||(zc=!0,r.unstable_scheduleCallback(r.unstable_NormalPriority,Tc)))}
function Vc(a){function b(b){return Uc(b,a)}if(0<Ac.length){Uc(Ac[0],a);for(var c=1;c<Ac.length;c++){var d=Ac[c];d.blockedOn===a&&(d.blockedOn=null)}}null!==Bc&&Uc(Bc,a);null!==Cc&&Uc(Cc,a);null!==Dc&&Uc(Dc,a);Ec.forEach(b);Fc.forEach(b);for(c=0;c<Gc.length;c++)d=Gc[c],d.blockedOn===a&&(d.blockedOn=null);for(;0<Gc.length&&(c=Gc[0],null===c.blockedOn);)Pc(c),null===c.blockedOn&&Gc.shift()}
var Wc={},Yc=new Map,Zc=new Map,$c=["abort","abort",Xb,"animationEnd",Yb,"animationIteration",Zb,"animationStart","canplay","canPlay","canplaythrough","canPlayThrough","durationchange","durationChange","emptied","emptied","encrypted","encrypted","ended","ended","error","error","gotpointercapture","gotPointerCapture","load","load","loadeddata","loadedData","loadedmetadata","loadedMetadata","loadstart","loadStart","lostpointercapture","lostPointerCapture","playing","playing","progress","progress","seeking",
"seeking","stalled","stalled","suspend","suspend","timeupdate","timeUpdate",$b,"transitionEnd","waiting","waiting"];function ad(a,b){for(var c=0;c<a.length;c+=2){var d=a[c],e=a[c+1],f="on"+(e[0].toUpperCase()+e.slice(1));f={phasedRegistrationNames:{bubbled:f,captured:f+"Capture"},dependencies:[d],eventPriority:b};Zc.set(d,b);Yc.set(d,f);Wc[e]=f}}
ad("blur blur cancel cancel click click close close contextmenu contextMenu copy copy cut cut auxclick auxClick dblclick doubleClick dragend dragEnd dragstart dragStart drop drop focus focus input input invalid invalid keydown keyDown keypress keyPress keyup keyUp mousedown mouseDown mouseup mouseUp paste paste pause pause play play pointercancel pointerCancel pointerdown pointerDown pointerup pointerUp ratechange rateChange reset reset seeked seeked submit submit touchcancel touchCancel touchend touchEnd touchstart touchStart volumechange volumeChange".split(" "),0);
ad("drag drag dragenter dragEnter dragexit dragExit dragleave dragLeave dragover dragOver mousemove mouseMove mouseout mouseOut mouseover mouseOver pointermove pointerMove pointerout pointerOut pointerover pointerOver scroll scroll toggle toggle touchmove touchMove wheel wheel".split(" "),1);ad($c,2);for(var bd="change selectionchange textInput compositionstart compositionend compositionupdate".split(" "),cd=0;cd<bd.length;cd++)Zc.set(bd[cd],0);
var dd=r.unstable_UserBlockingPriority,ed=r.unstable_runWithPriority,fd=!0;function F(a,b){vc(b,a,!1)}function vc(a,b,c){var d=Zc.get(b);switch(void 0===d?2:d){case 0:d=gd.bind(null,b,1,a);break;case 1:d=hd.bind(null,b,1,a);break;default:d=id.bind(null,b,1,a)}c?a.addEventListener(b,d,!0):a.addEventListener(b,d,!1)}function gd(a,b,c,d){Ja||Ha();var e=id,f=Ja;Ja=!0;try{Ga(e,a,b,c,d)}finally{(Ja=f)||La()}}function hd(a,b,c,d){ed(dd,id.bind(null,a,b,c,d))}
function id(a,b,c,d){if(fd)if(0<Ac.length&&-1<Hc.indexOf(a))a=Kc(null,a,b,c,d),Ac.push(a);else{var e=Rc(a,b,c,d);if(null===e)Lc(a,d);else if(-1<Hc.indexOf(a))a=Kc(e,a,b,c,d),Ac.push(a);else if(!Oc(e,a,b,c,d)){Lc(a,d);a=rc(a,d,null,b);try{Ma(sc,a)}finally{qc(a)}}}}
function Rc(a,b,c,d){c=nc(d);c=tc(c);if(null!==c){var e=dc(c);if(null===e)c=null;else{var f=e.tag;if(13===f){c=ec(e);if(null!==c)return c;c=null}else if(3===f){if(e.stateNode.hydrate)return 3===e.tag?e.stateNode.containerInfo:null;c=null}else e!==c&&(c=null)}}a=rc(a,d,c,b);try{Ma(sc,a)}finally{qc(a)}return null}
var jd={animationIterationCount:!0,borderImageOutset:!0,borderImageSlice:!0,borderImageWidth:!0,boxFlex:!0,boxFlexGroup:!0,boxOrdinalGroup:!0,columnCount:!0,columns:!0,flex:!0,flexGrow:!0,flexPositive:!0,flexShrink:!0,flexNegative:!0,flexOrder:!0,gridArea:!0,gridRow:!0,gridRowEnd:!0,gridRowSpan:!0,gridRowStart:!0,gridColumn:!0,gridColumnEnd:!0,gridColumnSpan:!0,gridColumnStart:!0,fontWeight:!0,lineClamp:!0,lineHeight:!0,opacity:!0,order:!0,orphans:!0,tabSize:!0,widows:!0,zIndex:!0,zoom:!0,fillOpacity:!0,
floodOpacity:!0,stopOpacity:!0,strokeDasharray:!0,strokeDashoffset:!0,strokeMiterlimit:!0,strokeOpacity:!0,strokeWidth:!0},kd=["Webkit","ms","Moz","O"];Object.keys(jd).forEach(function(a){kd.forEach(function(b){b=b+a.charAt(0).toUpperCase()+a.substring(1);jd[b]=jd[a]})});function ld(a,b,c){return null==b||"boolean"===typeof b||""===b?"":c||"number"!==typeof b||0===b||jd.hasOwnProperty(a)&&jd[a]?(""+b).trim():b+"px"}
function md(a,b){a=a.style;for(var c in b)if(b.hasOwnProperty(c)){var d=0===c.indexOf("--"),e=ld(c,b[c],d);"float"===c&&(c="cssFloat");d?a.setProperty(c,e):a[c]=e}}var nd=n({menuitem:!0},{area:!0,base:!0,br:!0,col:!0,embed:!0,hr:!0,img:!0,input:!0,keygen:!0,link:!0,meta:!0,param:!0,source:!0,track:!0,wbr:!0});
function od(a,b){if(b){if(nd[a]&&(null!=b.children||null!=b.dangerouslySetInnerHTML))throw Error(u(137,a,""));if(null!=b.dangerouslySetInnerHTML){if(null!=b.children)throw Error(u(60));if(!("object"===typeof b.dangerouslySetInnerHTML&&"__html"in b.dangerouslySetInnerHTML))throw Error(u(61));}if(null!=b.style&&"object"!==typeof b.style)throw Error(u(62,""));}}
function pd(a,b){if(-1===a.indexOf("-"))return"string"===typeof b.is;switch(a){case "annotation-xml":case "color-profile":case "font-face":case "font-face-src":case "font-face-uri":case "font-face-format":case "font-face-name":case "missing-glyph":return!1;default:return!0}}var qd=Mb.html;function rd(a,b){a=9===a.nodeType||11===a.nodeType?a:a.ownerDocument;var c=cc(a);b=wa[b];for(var d=0;d<b.length;d++)uc(b[d],a,c)}function sd(){}
function td(a){a=a||("undefined"!==typeof document?document:void 0);if("undefined"===typeof a)return null;try{return a.activeElement||a.body}catch(b){return a.body}}function ud(a){for(;a&&a.firstChild;)a=a.firstChild;return a}function vd(a,b){var c=ud(a);a=0;for(var d;c;){if(3===c.nodeType){d=a+c.textContent.length;if(a<=b&&d>=b)return{node:c,offset:b-a};a=d}a:{for(;c;){if(c.nextSibling){c=c.nextSibling;break a}c=c.parentNode}c=void 0}c=ud(c)}}
function wd(a,b){return a&&b?a===b?!0:a&&3===a.nodeType?!1:b&&3===b.nodeType?wd(a,b.parentNode):"contains"in a?a.contains(b):a.compareDocumentPosition?!!(a.compareDocumentPosition(b)&16):!1:!1}function xd(){for(var a=window,b=td();b instanceof a.HTMLIFrameElement;){try{var c="string"===typeof b.contentWindow.location.href}catch(d){c=!1}if(c)a=b.contentWindow;else break;b=td(a.document)}return b}
function yd(a){var b=a&&a.nodeName&&a.nodeName.toLowerCase();return b&&("input"===b&&("text"===a.type||"search"===a.type||"tel"===a.type||"url"===a.type||"password"===a.type)||"textarea"===b||"true"===a.contentEditable)}var zd="$",Ad="/$",Bd="$?",Cd="$!",Dd=null,Ed=null;function Fd(a,b){switch(a){case "button":case "input":case "select":case "textarea":return!!b.autoFocus}return!1}
function Gd(a,b){return"textarea"===a||"option"===a||"noscript"===a||"string"===typeof b.children||"number"===typeof b.children||"object"===typeof b.dangerouslySetInnerHTML&&null!==b.dangerouslySetInnerHTML&&null!=b.dangerouslySetInnerHTML.__html}var Hd="function"===typeof setTimeout?setTimeout:void 0,Id="function"===typeof clearTimeout?clearTimeout:void 0;function Jd(a){for(;null!=a;a=a.nextSibling){var b=a.nodeType;if(1===b||3===b)break}return a}
function Kd(a){a=a.previousSibling;for(var b=0;a;){if(8===a.nodeType){var c=a.data;if(c===zd||c===Cd||c===Bd){if(0===b)return a;b--}else c===Ad&&b++}a=a.previousSibling}return null}var Ld=Math.random().toString(36).slice(2),Md="__reactInternalInstance$"+Ld,Nd="__reactEventHandlers$"+Ld,Od="__reactContainere$"+Ld;
function tc(a){var b=a[Md];if(b)return b;for(var c=a.parentNode;c;){if(b=c[Od]||c[Md]){c=b.alternate;if(null!==b.child||null!==c&&null!==c.child)for(a=Kd(a);null!==a;){if(c=a[Md])return c;a=Kd(a)}return b}a=c;c=a.parentNode}return null}function Nc(a){a=a[Md]||a[Od];return!a||5!==a.tag&&6!==a.tag&&13!==a.tag&&3!==a.tag?null:a}function Pd(a){if(5===a.tag||6===a.tag)return a.stateNode;throw Error(u(33));}function Qd(a){return a[Nd]||null}
function Rd(a){do a=a.return;while(a&&5!==a.tag);return a?a:null}
function Sd(a,b){var c=a.stateNode;if(!c)return null;var d=la(c);if(!d)return null;c=d[b];a:switch(b){case "onClick":case "onClickCapture":case "onDoubleClick":case "onDoubleClickCapture":case "onMouseDown":case "onMouseDownCapture":case "onMouseMove":case "onMouseMoveCapture":case "onMouseUp":case "onMouseUpCapture":case "onMouseEnter":(d=!d.disabled)||(a=a.type,d=!("button"===a||"input"===a||"select"===a||"textarea"===a));a=!d;break a;default:a=!1}if(a)return null;if(c&&"function"!==typeof c)throw Error(u(231,
b,typeof c));return c}function Td(a,b,c){if(b=Sd(a,c.dispatchConfig.phasedRegistrationNames[b]))c._dispatchListeners=ic(c._dispatchListeners,b),c._dispatchInstances=ic(c._dispatchInstances,a)}function Ud(a){if(a&&a.dispatchConfig.phasedRegistrationNames){for(var b=a._targetInst,c=[];b;)c.push(b),b=Rd(b);for(b=c.length;0<b--;)Td(c[b],"captured",a);for(b=0;b<c.length;b++)Td(c[b],"bubbled",a)}}
function Vd(a,b,c){a&&c&&c.dispatchConfig.registrationName&&(b=Sd(a,c.dispatchConfig.registrationName))&&(c._dispatchListeners=ic(c._dispatchListeners,b),c._dispatchInstances=ic(c._dispatchInstances,a))}function Wd(a){a&&a.dispatchConfig.registrationName&&Vd(a._targetInst,null,a)}function Xd(a){jc(a,Ud)}var Yd=null,Zd=null,$d=null;
function ae(){if($d)return $d;var a,b=Zd,c=b.length,d,e="value"in Yd?Yd.value:Yd.textContent,f=e.length;for(a=0;a<c&&b[a]===e[a];a++);var g=c-a;for(d=1;d<=g&&b[c-d]===e[f-d];d++);return $d=e.slice(a,1<d?1-d:void 0)}function be(){return!0}function ce(){return!1}
function G(a,b,c,d){this.dispatchConfig=a;this._targetInst=b;this.nativeEvent=c;a=this.constructor.Interface;for(var e in a)a.hasOwnProperty(e)&&((b=a[e])?this[e]=b(c):"target"===e?this.target=d:this[e]=c[e]);this.isDefaultPrevented=(null!=c.defaultPrevented?c.defaultPrevented:!1===c.returnValue)?be:ce;this.isPropagationStopped=ce;return this}
n(G.prototype,{preventDefault:function(){this.defaultPrevented=!0;var a=this.nativeEvent;a&&(a.preventDefault?a.preventDefault():"unknown"!==typeof a.returnValue&&(a.returnValue=!1),this.isDefaultPrevented=be)},stopPropagation:function(){var a=this.nativeEvent;a&&(a.stopPropagation?a.stopPropagation():"unknown"!==typeof a.cancelBubble&&(a.cancelBubble=!0),this.isPropagationStopped=be)},persist:function(){this.isPersistent=be},isPersistent:ce,destructor:function(){var a=this.constructor.Interface,
b;for(b in a)this[b]=null;this.nativeEvent=this._targetInst=this.dispatchConfig=null;this.isPropagationStopped=this.isDefaultPrevented=ce;this._dispatchInstances=this._dispatchListeners=null}});G.Interface={type:null,target:null,currentTarget:function(){return null},eventPhase:null,bubbles:null,cancelable:null,timeStamp:function(a){return a.timeStamp||Date.now()},defaultPrevented:null,isTrusted:null};
G.extend=function(a){function b(){}function c(){return d.apply(this,arguments)}var d=this;b.prototype=d.prototype;var e=new b;n(e,c.prototype);c.prototype=e;c.prototype.constructor=c;c.Interface=n({},d.Interface,a);c.extend=d.extend;de(c);return c};de(G);function ee(a,b,c,d){if(this.eventPool.length){var e=this.eventPool.pop();this.call(e,a,b,c,d);return e}return new this(a,b,c,d)}
function fe(a){if(!(a instanceof this))throw Error(u(279));a.destructor();10>this.eventPool.length&&this.eventPool.push(a)}function de(a){a.eventPool=[];a.getPooled=ee;a.release=fe}var ge=G.extend({data:null}),he=G.extend({data:null}),ie=[9,13,27,32],je=ya&&"CompositionEvent"in window,ke=null;ya&&"documentMode"in document&&(ke=document.documentMode);
var le=ya&&"TextEvent"in window&&!ke,me=ya&&(!je||ke&&8<ke&&11>=ke),ne=String.fromCharCode(32),oe={beforeInput:{phasedRegistrationNames:{bubbled:"onBeforeInput",captured:"onBeforeInputCapture"},dependencies:["compositionend","keypress","textInput","paste"]},compositionEnd:{phasedRegistrationNames:{bubbled:"onCompositionEnd",captured:"onCompositionEndCapture"},dependencies:"blur compositionend keydown keypress keyup mousedown".split(" ")},compositionStart:{phasedRegistrationNames:{bubbled:"onCompositionStart",
captured:"onCompositionStartCapture"},dependencies:"blur compositionstart keydown keypress keyup mousedown".split(" ")},compositionUpdate:{phasedRegistrationNames:{bubbled:"onCompositionUpdate",captured:"onCompositionUpdateCapture"},dependencies:"blur compositionupdate keydown keypress keyup mousedown".split(" ")}},pe=!1;
function qe(a,b){switch(a){case "keyup":return-1!==ie.indexOf(b.keyCode);case "keydown":return 229!==b.keyCode;case "keypress":case "mousedown":case "blur":return!0;default:return!1}}function re(a){a=a.detail;return"object"===typeof a&&"data"in a?a.data:null}var se=!1;function te(a,b){switch(a){case "compositionend":return re(b);case "keypress":if(32!==b.which)return null;pe=!0;return ne;case "textInput":return a=b.data,a===ne&&pe?null:a;default:return null}}
function ue(a,b){if(se)return"compositionend"===a||!je&&qe(a,b)?(a=ae(),$d=Zd=Yd=null,se=!1,a):null;switch(a){case "paste":return null;case "keypress":if(!(b.ctrlKey||b.altKey||b.metaKey)||b.ctrlKey&&b.altKey){if(b.char&&1<b.char.length)return b.char;if(b.which)return String.fromCharCode(b.which)}return null;case "compositionend":return me&&"ko"!==b.locale?null:b.data;default:return null}}
var ve={eventTypes:oe,extractEvents:function(a,b,c,d){var e;if(je)b:{switch(a){case "compositionstart":var f=oe.compositionStart;break b;case "compositionend":f=oe.compositionEnd;break b;case "compositionupdate":f=oe.compositionUpdate;break b}f=void 0}else se?qe(a,c)&&(f=oe.compositionEnd):"keydown"===a&&229===c.keyCode&&(f=oe.compositionStart);f?(me&&"ko"!==c.locale&&(se||f!==oe.compositionStart?f===oe.compositionEnd&&se&&(e=ae()):(Yd=d,Zd="value"in Yd?Yd.value:Yd.textContent,se=!0)),f=ge.getPooled(f,
b,c,d),e?f.data=e:(e=re(c),null!==e&&(f.data=e)),Xd(f),e=f):e=null;(a=le?te(a,c):ue(a,c))?(b=he.getPooled(oe.beforeInput,b,c,d),b.data=a,Xd(b)):b=null;return null===e?b:null===b?e:[e,b]}},we={color:!0,date:!0,datetime:!0,"datetime-local":!0,email:!0,month:!0,number:!0,password:!0,range:!0,search:!0,tel:!0,text:!0,time:!0,url:!0,week:!0};function xe(a){var b=a&&a.nodeName&&a.nodeName.toLowerCase();return"input"===b?!!we[a.type]:"textarea"===b?!0:!1}
var ye={change:{phasedRegistrationNames:{bubbled:"onChange",captured:"onChangeCapture"},dependencies:"blur change click focus input keydown keyup selectionchange".split(" ")}};function ze(a,b,c){a=G.getPooled(ye.change,a,b,c);a.type="change";Da(c);Xd(a);return a}var Ae=null,Be=null;function Ce(a){mc(a)}function De(a){var b=Pd(a);if(yb(b))return a}function Ee(a,b){if("change"===a)return b}var Fe=!1;ya&&(Fe=oc("input")&&(!document.documentMode||9<document.documentMode));
function Ge(){Ae&&(Ae.detachEvent("onpropertychange",He),Be=Ae=null)}function He(a){if("value"===a.propertyName&&De(Be))if(a=ze(Be,a,nc(a)),Ja)mc(a);else{Ja=!0;try{Fa(Ce,a)}finally{Ja=!1,La()}}}function Ie(a,b,c){"focus"===a?(Ge(),Ae=b,Be=c,Ae.attachEvent("onpropertychange",He)):"blur"===a&&Ge()}function Je(a){if("selectionchange"===a||"keyup"===a||"keydown"===a)return De(Be)}function Ke(a,b){if("click"===a)return De(b)}function Le(a,b){if("input"===a||"change"===a)return De(b)}
var Me={eventTypes:ye,_isInputEventSupported:Fe,extractEvents:function(a,b,c,d){var e=b?Pd(b):window,f=e.nodeName&&e.nodeName.toLowerCase();if("select"===f||"input"===f&&"file"===e.type)var g=Ee;else if(xe(e))if(Fe)g=Le;else{g=Je;var h=Ie}else(f=e.nodeName)&&"input"===f.toLowerCase()&&("checkbox"===e.type||"radio"===e.type)&&(g=Ke);if(g&&(g=g(a,b)))return ze(g,c,d);h&&h(a,e,b);"blur"===a&&(a=e._wrapperState)&&a.controlled&&"number"===e.type&&Db(e,"number",e.value)}},Ne=G.extend({view:null,detail:null}),
Oe={Alt:"altKey",Control:"ctrlKey",Meta:"metaKey",Shift:"shiftKey"};function Pe(a){var b=this.nativeEvent;return b.getModifierState?b.getModifierState(a):(a=Oe[a])?!!b[a]:!1}function Qe(){return Pe}
var Re=0,Se=0,Te=!1,Ue=!1,Ve=Ne.extend({screenX:null,screenY:null,clientX:null,clientY:null,pageX:null,pageY:null,ctrlKey:null,shiftKey:null,altKey:null,metaKey:null,getModifierState:Qe,button:null,buttons:null,relatedTarget:function(a){return a.relatedTarget||(a.fromElement===a.srcElement?a.toElement:a.fromElement)},movementX:function(a){if("movementX"in a)return a.movementX;var b=Re;Re=a.screenX;return Te?"mousemove"===a.type?a.screenX-b:0:(Te=!0,0)},movementY:function(a){if("movementY"in a)return a.movementY;
var b=Se;Se=a.screenY;return Ue?"mousemove"===a.type?a.screenY-b:0:(Ue=!0,0)}}),We=Ve.extend({pointerId:null,width:null,height:null,pressure:null,tangentialPressure:null,tiltX:null,tiltY:null,twist:null,pointerType:null,isPrimary:null}),Xe={mouseEnter:{registrationName:"onMouseEnter",dependencies:["mouseout","mouseover"]},mouseLeave:{registrationName:"onMouseLeave",dependencies:["mouseout","mouseover"]},pointerEnter:{registrationName:"onPointerEnter",dependencies:["pointerout","pointerover"]},pointerLeave:{registrationName:"onPointerLeave",
dependencies:["pointerout","pointerover"]}},Ye={eventTypes:Xe,extractEvents:function(a,b,c,d,e){var f="mouseover"===a||"pointerover"===a,g="mouseout"===a||"pointerout"===a;if(f&&0===(e&32)&&(c.relatedTarget||c.fromElement)||!g&&!f)return null;f=d.window===d?d:(f=d.ownerDocument)?f.defaultView||f.parentWindow:window;if(g){if(g=b,b=(b=c.relatedTarget||c.toElement)?tc(b):null,null!==b){var h=dc(b);if(b!==h||5!==b.tag&&6!==b.tag)b=null}}else g=null;if(g===b)return null;if("mouseout"===a||"mouseover"===
a){var k=Ve;var l=Xe.mouseLeave;var m=Xe.mouseEnter;var p="mouse"}else if("pointerout"===a||"pointerover"===a)k=We,l=Xe.pointerLeave,m=Xe.pointerEnter,p="pointer";a=null==g?f:Pd(g);f=null==b?f:Pd(b);l=k.getPooled(l,g,c,d);l.type=p+"leave";l.target=a;l.relatedTarget=f;c=k.getPooled(m,b,c,d);c.type=p+"enter";c.target=f;c.relatedTarget=a;d=g;p=b;if(d&&p)a:{k=d;m=p;g=0;for(a=k;a;a=Rd(a))g++;a=0;for(b=m;b;b=Rd(b))a++;for(;0<g-a;)k=Rd(k),g--;for(;0<a-g;)m=Rd(m),a--;for(;g--;){if(k===m||k===m.alternate)break a;
k=Rd(k);m=Rd(m)}k=null}else k=null;m=k;for(k=[];d&&d!==m;){g=d.alternate;if(null!==g&&g===m)break;k.push(d);d=Rd(d)}for(d=[];p&&p!==m;){g=p.alternate;if(null!==g&&g===m)break;d.push(p);p=Rd(p)}for(p=0;p<k.length;p++)Vd(k[p],"bubbled",l);for(p=d.length;0<p--;)Vd(d[p],"captured",c);return 0===(e&64)?[l]:[l,c]}};function Ze(a,b){return a===b&&(0!==a||1/a===1/b)||a!==a&&b!==b}var $e="function"===typeof Object.is?Object.is:Ze,af=Object.prototype.hasOwnProperty;
function bf(a,b){if($e(a,b))return!0;if("object"!==typeof a||null===a||"object"!==typeof b||null===b)return!1;var c=Object.keys(a),d=Object.keys(b);if(c.length!==d.length)return!1;for(d=0;d<c.length;d++)if(!af.call(b,c[d])||!$e(a[c[d]],b[c[d]]))return!1;return!0}
var cf=ya&&"documentMode"in document&&11>=document.documentMode,df={select:{phasedRegistrationNames:{bubbled:"onSelect",captured:"onSelectCapture"},dependencies:"blur contextmenu dragend focus keydown keyup mousedown mouseup selectionchange".split(" ")}},ef=null,ff=null,gf=null,hf=!1;
function jf(a,b){var c=b.window===b?b.document:9===b.nodeType?b:b.ownerDocument;if(hf||null==ef||ef!==td(c))return null;c=ef;"selectionStart"in c&&yd(c)?c={start:c.selectionStart,end:c.selectionEnd}:(c=(c.ownerDocument&&c.ownerDocument.defaultView||window).getSelection(),c={anchorNode:c.anchorNode,anchorOffset:c.anchorOffset,focusNode:c.focusNode,focusOffset:c.focusOffset});return gf&&bf(gf,c)?null:(gf=c,a=G.getPooled(df.select,ff,a,b),a.type="select",a.target=ef,Xd(a),a)}
var kf={eventTypes:df,extractEvents:function(a,b,c,d,e,f){e=f||(d.window===d?d.document:9===d.nodeType?d:d.ownerDocument);if(!(f=!e)){a:{e=cc(e);f=wa.onSelect;for(var g=0;g<f.length;g++)if(!e.has(f[g])){e=!1;break a}e=!0}f=!e}if(f)return null;e=b?Pd(b):window;switch(a){case "focus":if(xe(e)||"true"===e.contentEditable)ef=e,ff=b,gf=null;break;case "blur":gf=ff=ef=null;break;case "mousedown":hf=!0;break;case "contextmenu":case "mouseup":case "dragend":return hf=!1,jf(c,d);case "selectionchange":if(cf)break;
case "keydown":case "keyup":return jf(c,d)}return null}},lf=G.extend({animationName:null,elapsedTime:null,pseudoElement:null}),mf=G.extend({clipboardData:function(a){return"clipboardData"in a?a.clipboardData:window.clipboardData}}),nf=Ne.extend({relatedTarget:null});function of(a){var b=a.keyCode;"charCode"in a?(a=a.charCode,0===a&&13===b&&(a=13)):a=b;10===a&&(a=13);return 32<=a||13===a?a:0}
var pf={Esc:"Escape",Spacebar:" ",Left:"ArrowLeft",Up:"ArrowUp",Right:"ArrowRight",Down:"ArrowDown",Del:"Delete",Win:"OS",Menu:"ContextMenu",Apps:"ContextMenu",Scroll:"ScrollLock",MozPrintableKey:"Unidentified"},qf={8:"Backspace",9:"Tab",12:"Clear",13:"Enter",16:"Shift",17:"Control",18:"Alt",19:"Pause",20:"CapsLock",27:"Escape",32:" ",33:"PageUp",34:"PageDown",35:"End",36:"Home",37:"ArrowLeft",38:"ArrowUp",39:"ArrowRight",40:"ArrowDown",45:"Insert",46:"Delete",112:"F1",113:"F2",114:"F3",115:"F4",
116:"F5",117:"F6",118:"F7",119:"F8",120:"F9",121:"F10",122:"F11",123:"F12",144:"NumLock",145:"ScrollLock",224:"Meta"},rf=Ne.extend({key:function(a){if(a.key){var b=pf[a.key]||a.key;if("Unidentified"!==b)return b}return"keypress"===a.type?(a=of(a),13===a?"Enter":String.fromCharCode(a)):"keydown"===a.type||"keyup"===a.type?qf[a.keyCode]||"Unidentified":""},location:null,ctrlKey:null,shiftKey:null,altKey:null,metaKey:null,repeat:null,locale:null,getModifierState:Qe,charCode:function(a){return"keypress"===
a.type?of(a):0},keyCode:function(a){return"keydown"===a.type||"keyup"===a.type?a.keyCode:0},which:function(a){return"keypress"===a.type?of(a):"keydown"===a.type||"keyup"===a.type?a.keyCode:0}}),sf=Ve.extend({dataTransfer:null}),tf=Ne.extend({touches:null,targetTouches:null,changedTouches:null,altKey:null,metaKey:null,ctrlKey:null,shiftKey:null,getModifierState:Qe}),uf=G.extend({propertyName:null,elapsedTime:null,pseudoElement:null}),vf=Ve.extend({deltaX:function(a){return"deltaX"in a?a.deltaX:"wheelDeltaX"in
a?-a.wheelDeltaX:0},deltaY:function(a){return"deltaY"in a?a.deltaY:"wheelDeltaY"in a?-a.wheelDeltaY:"wheelDelta"in a?-a.wheelDelta:0},deltaZ:null,deltaMode:null}),wf={eventTypes:Wc,extractEvents:function(a,b,c,d){var e=Yc.get(a);if(!e)return null;switch(a){case "keypress":if(0===of(c))return null;case "keydown":case "keyup":a=rf;break;case "blur":case "focus":a=nf;break;case "click":if(2===c.button)return null;case "auxclick":case "dblclick":case "mousedown":case "mousemove":case "mouseup":case "mouseout":case "mouseover":case "contextmenu":a=
Ve;break;case "drag":case "dragend":case "dragenter":case "dragexit":case "dragleave":case "dragover":case "dragstart":case "drop":a=sf;break;case "touchcancel":case "touchend":case "touchmove":case "touchstart":a=tf;break;case Xb:case Yb:case Zb:a=lf;break;case $b:a=uf;break;case "scroll":a=Ne;break;case "wheel":a=vf;break;case "copy":case "cut":case "paste":a=mf;break;case "gotpointercapture":case "lostpointercapture":case "pointercancel":case "pointerdown":case "pointermove":case "pointerout":case "pointerover":case "pointerup":a=
We;break;default:a=G}b=a.getPooled(e,b,c,d);Xd(b);return b}};if(pa)throw Error(u(101));pa=Array.prototype.slice.call("ResponderEventPlugin SimpleEventPlugin EnterLeaveEventPlugin ChangeEventPlugin SelectEventPlugin BeforeInputEventPlugin".split(" "));ra();var xf=Nc;la=Qd;ma=xf;na=Pd;xa({SimpleEventPlugin:wf,EnterLeaveEventPlugin:Ye,ChangeEventPlugin:Me,SelectEventPlugin:kf,BeforeInputEventPlugin:ve});var yf=[],zf=-1;function H(a){0>zf||(a.current=yf[zf],yf[zf]=null,zf--)}
function I(a,b){zf++;yf[zf]=a.current;a.current=b}var Af={},J={current:Af},K={current:!1},Bf=Af;function Cf(a,b){var c=a.type.contextTypes;if(!c)return Af;var d=a.stateNode;if(d&&d.__reactInternalMemoizedUnmaskedChildContext===b)return d.__reactInternalMemoizedMaskedChildContext;var e={},f;for(f in c)e[f]=b[f];d&&(a=a.stateNode,a.__reactInternalMemoizedUnmaskedChildContext=b,a.__reactInternalMemoizedMaskedChildContext=e);return e}function L(a){a=a.childContextTypes;return null!==a&&void 0!==a}
function Df(){H(K);H(J)}function Ef(a,b,c){if(J.current!==Af)throw Error(u(168));I(J,b);I(K,c)}function Ff(a,b,c){var d=a.stateNode;a=b.childContextTypes;if("function"!==typeof d.getChildContext)return c;d=d.getChildContext();for(var e in d)if(!(e in a))throw Error(u(108,pb(b)||"Unknown",e));return n({},c,{},d)}function Gf(a){a=(a=a.stateNode)&&a.__reactInternalMemoizedMergedChildContext||Af;Bf=J.current;I(J,a);I(K,K.current);return!0}
function Hf(a,b,c){var d=a.stateNode;if(!d)throw Error(u(169));c?(a=Ff(a,b,Bf),d.__reactInternalMemoizedMergedChildContext=a,H(K),H(J),I(J,a)):H(K);I(K,c)}
var If=r.unstable_runWithPriority,Jf=r.unstable_scheduleCallback,Kf=r.unstable_cancelCallback,Lf=r.unstable_requestPaint,Mf=r.unstable_now,Nf=r.unstable_getCurrentPriorityLevel,Of=r.unstable_ImmediatePriority,Pf=r.unstable_UserBlockingPriority,Qf=r.unstable_NormalPriority,Rf=r.unstable_LowPriority,Sf=r.unstable_IdlePriority,Tf={},Uf=r.unstable_shouldYield,Vf=void 0!==Lf?Lf:function(){},Wf=null,Xf=null,Yf=!1,Zf=Mf(),$f=1E4>Zf?Mf:function(){return Mf()-Zf};
function ag(){switch(Nf()){case Of:return 99;case Pf:return 98;case Qf:return 97;case Rf:return 96;case Sf:return 95;default:throw Error(u(332));}}function bg(a){switch(a){case 99:return Of;case 98:return Pf;case 97:return Qf;case 96:return Rf;case 95:return Sf;default:throw Error(u(332));}}function cg(a,b){a=bg(a);return If(a,b)}function dg(a,b,c){a=bg(a);return Jf(a,b,c)}function eg(a){null===Wf?(Wf=[a],Xf=Jf(Of,fg)):Wf.push(a);return Tf}function gg(){if(null!==Xf){var a=Xf;Xf=null;Kf(a)}fg()}
function fg(){if(!Yf&&null!==Wf){Yf=!0;var a=0;try{var b=Wf;cg(99,function(){for(;a<b.length;a++){var c=b[a];do c=c(!0);while(null!==c)}});Wf=null}catch(c){throw null!==Wf&&(Wf=Wf.slice(a+1)),Jf(Of,gg),c;}finally{Yf=!1}}}function hg(a,b,c){c/=10;return 1073741821-(((1073741821-a+b/10)/c|0)+1)*c}function ig(a,b){if(a&&a.defaultProps){b=n({},b);a=a.defaultProps;for(var c in a)void 0===b[c]&&(b[c]=a[c])}return b}var jg={current:null},kg=null,lg=null,mg=null;function ng(){mg=lg=kg=null}
function og(a){var b=jg.current;H(jg);a.type._context._currentValue=b}function pg(a,b){for(;null!==a;){var c=a.alternate;if(a.childExpirationTime<b)a.childExpirationTime=b,null!==c&&c.childExpirationTime<b&&(c.childExpirationTime=b);else if(null!==c&&c.childExpirationTime<b)c.childExpirationTime=b;else break;a=a.return}}function qg(a,b){kg=a;mg=lg=null;a=a.dependencies;null!==a&&null!==a.firstContext&&(a.expirationTime>=b&&(rg=!0),a.firstContext=null)}
function sg(a,b){if(mg!==a&&!1!==b&&0!==b){if("number"!==typeof b||1073741823===b)mg=a,b=1073741823;b={context:a,observedBits:b,next:null};if(null===lg){if(null===kg)throw Error(u(308));lg=b;kg.dependencies={expirationTime:0,firstContext:b,responders:null}}else lg=lg.next=b}return a._currentValue}var tg=!1;function ug(a){a.updateQueue={baseState:a.memoizedState,baseQueue:null,shared:{pending:null},effects:null}}
function vg(a,b){a=a.updateQueue;b.updateQueue===a&&(b.updateQueue={baseState:a.baseState,baseQueue:a.baseQueue,shared:a.shared,effects:a.effects})}function wg(a,b){a={expirationTime:a,suspenseConfig:b,tag:0,payload:null,callback:null,next:null};return a.next=a}function xg(a,b){a=a.updateQueue;if(null!==a){a=a.shared;var c=a.pending;null===c?b.next=b:(b.next=c.next,c.next=b);a.pending=b}}
function yg(a,b){var c=a.alternate;null!==c&&vg(c,a);a=a.updateQueue;c=a.baseQueue;null===c?(a.baseQueue=b.next=b,b.next=b):(b.next=c.next,c.next=b)}
function zg(a,b,c,d){var e=a.updateQueue;tg=!1;var f=e.baseQueue,g=e.shared.pending;if(null!==g){if(null!==f){var h=f.next;f.next=g.next;g.next=h}f=g;e.shared.pending=null;h=a.alternate;null!==h&&(h=h.updateQueue,null!==h&&(h.baseQueue=g))}if(null!==f){h=f.next;var k=e.baseState,l=0,m=null,p=null,x=null;if(null!==h){var z=h;do{g=z.expirationTime;if(g<d){var ca={expirationTime:z.expirationTime,suspenseConfig:z.suspenseConfig,tag:z.tag,payload:z.payload,callback:z.callback,next:null};null===x?(p=x=
ca,m=k):x=x.next=ca;g>l&&(l=g)}else{null!==x&&(x=x.next={expirationTime:1073741823,suspenseConfig:z.suspenseConfig,tag:z.tag,payload:z.payload,callback:z.callback,next:null});Ag(g,z.suspenseConfig);a:{var D=a,t=z;g=b;ca=c;switch(t.tag){case 1:D=t.payload;if("function"===typeof D){k=D.call(ca,k,g);break a}k=D;break a;case 3:D.effectTag=D.effectTag&-4097|64;case 0:D=t.payload;g="function"===typeof D?D.call(ca,k,g):D;if(null===g||void 0===g)break a;k=n({},k,g);break a;case 2:tg=!0}}null!==z.callback&&
(a.effectTag|=32,g=e.effects,null===g?e.effects=[z]:g.push(z))}z=z.next;if(null===z||z===h)if(g=e.shared.pending,null===g)break;else z=f.next=g.next,g.next=h,e.baseQueue=f=g,e.shared.pending=null}while(1)}null===x?m=k:x.next=p;e.baseState=m;e.baseQueue=x;Bg(l);a.expirationTime=l;a.memoizedState=k}}
function Cg(a,b,c){a=b.effects;b.effects=null;if(null!==a)for(b=0;b<a.length;b++){var d=a[b],e=d.callback;if(null!==e){d.callback=null;d=e;e=c;if("function"!==typeof d)throw Error(u(191,d));d.call(e)}}}var Dg=Wa.ReactCurrentBatchConfig,Eg=(new aa.Component).refs;function Fg(a,b,c,d){b=a.memoizedState;c=c(d,b);c=null===c||void 0===c?b:n({},b,c);a.memoizedState=c;0===a.expirationTime&&(a.updateQueue.baseState=c)}
var Jg={isMounted:function(a){return(a=a._reactInternalFiber)?dc(a)===a:!1},enqueueSetState:function(a,b,c){a=a._reactInternalFiber;var d=Gg(),e=Dg.suspense;d=Hg(d,a,e);e=wg(d,e);e.payload=b;void 0!==c&&null!==c&&(e.callback=c);xg(a,e);Ig(a,d)},enqueueReplaceState:function(a,b,c){a=a._reactInternalFiber;var d=Gg(),e=Dg.suspense;d=Hg(d,a,e);e=wg(d,e);e.tag=1;e.payload=b;void 0!==c&&null!==c&&(e.callback=c);xg(a,e);Ig(a,d)},enqueueForceUpdate:function(a,b){a=a._reactInternalFiber;var c=Gg(),d=Dg.suspense;
c=Hg(c,a,d);d=wg(c,d);d.tag=2;void 0!==b&&null!==b&&(d.callback=b);xg(a,d);Ig(a,c)}};function Kg(a,b,c,d,e,f,g){a=a.stateNode;return"function"===typeof a.shouldComponentUpdate?a.shouldComponentUpdate(d,f,g):b.prototype&&b.prototype.isPureReactComponent?!bf(c,d)||!bf(e,f):!0}
function Lg(a,b,c){var d=!1,e=Af;var f=b.contextType;"object"===typeof f&&null!==f?f=sg(f):(e=L(b)?Bf:J.current,d=b.contextTypes,f=(d=null!==d&&void 0!==d)?Cf(a,e):Af);b=new b(c,f);a.memoizedState=null!==b.state&&void 0!==b.state?b.state:null;b.updater=Jg;a.stateNode=b;b._reactInternalFiber=a;d&&(a=a.stateNode,a.__reactInternalMemoizedUnmaskedChildContext=e,a.__reactInternalMemoizedMaskedChildContext=f);return b}
function Mg(a,b,c,d){a=b.state;"function"===typeof b.componentWillReceiveProps&&b.componentWillReceiveProps(c,d);"function"===typeof b.UNSAFE_componentWillReceiveProps&&b.UNSAFE_componentWillReceiveProps(c,d);b.state!==a&&Jg.enqueueReplaceState(b,b.state,null)}
function Ng(a,b,c,d){var e=a.stateNode;e.props=c;e.state=a.memoizedState;e.refs=Eg;ug(a);var f=b.contextType;"object"===typeof f&&null!==f?e.context=sg(f):(f=L(b)?Bf:J.current,e.context=Cf(a,f));zg(a,c,e,d);e.state=a.memoizedState;f=b.getDerivedStateFromProps;"function"===typeof f&&(Fg(a,b,f,c),e.state=a.memoizedState);"function"===typeof b.getDerivedStateFromProps||"function"===typeof e.getSnapshotBeforeUpdate||"function"!==typeof e.UNSAFE_componentWillMount&&"function"!==typeof e.componentWillMount||
(b=e.state,"function"===typeof e.componentWillMount&&e.componentWillMount(),"function"===typeof e.UNSAFE_componentWillMount&&e.UNSAFE_componentWillMount(),b!==e.state&&Jg.enqueueReplaceState(e,e.state,null),zg(a,c,e,d),e.state=a.memoizedState);"function"===typeof e.componentDidMount&&(a.effectTag|=4)}var Og=Array.isArray;
function Pg(a,b,c){a=c.ref;if(null!==a&&"function"!==typeof a&&"object"!==typeof a){if(c._owner){c=c._owner;if(c){if(1!==c.tag)throw Error(u(309));var d=c.stateNode}if(!d)throw Error(u(147,a));var e=""+a;if(null!==b&&null!==b.ref&&"function"===typeof b.ref&&b.ref._stringRef===e)return b.ref;b=function(a){var b=d.refs;b===Eg&&(b=d.refs={});null===a?delete b[e]:b[e]=a};b._stringRef=e;return b}if("string"!==typeof a)throw Error(u(284));if(!c._owner)throw Error(u(290,a));}return a}
function Qg(a,b){if("textarea"!==a.type)throw Error(u(31,"[object Object]"===Object.prototype.toString.call(b)?"object with keys {"+Object.keys(b).join(", ")+"}":b,""));}
function Rg(a){function b(b,c){if(a){var d=b.lastEffect;null!==d?(d.nextEffect=c,b.lastEffect=c):b.firstEffect=b.lastEffect=c;c.nextEffect=null;c.effectTag=8}}function c(c,d){if(!a)return null;for(;null!==d;)b(c,d),d=d.sibling;return null}function d(a,b){for(a=new Map;null!==b;)null!==b.key?a.set(b.key,b):a.set(b.index,b),b=b.sibling;return a}function e(a,b){a=Sg(a,b);a.index=0;a.sibling=null;return a}function f(b,c,d){b.index=d;if(!a)return c;d=b.alternate;if(null!==d)return d=d.index,d<c?(b.effectTag=
2,c):d;b.effectTag=2;return c}function g(b){a&&null===b.alternate&&(b.effectTag=2);return b}function h(a,b,c,d){if(null===b||6!==b.tag)return b=Tg(c,a.mode,d),b.return=a,b;b=e(b,c);b.return=a;return b}function k(a,b,c,d){if(null!==b&&b.elementType===c.type)return d=e(b,c.props),d.ref=Pg(a,b,c),d.return=a,d;d=Ug(c.type,c.key,c.props,null,a.mode,d);d.ref=Pg(a,b,c);d.return=a;return d}function l(a,b,c,d){if(null===b||4!==b.tag||b.stateNode.containerInfo!==c.containerInfo||b.stateNode.implementation!==
c.implementation)return b=Vg(c,a.mode,d),b.return=a,b;b=e(b,c.children||[]);b.return=a;return b}function m(a,b,c,d,f){if(null===b||7!==b.tag)return b=Wg(c,a.mode,d,f),b.return=a,b;b=e(b,c);b.return=a;return b}function p(a,b,c){if("string"===typeof b||"number"===typeof b)return b=Tg(""+b,a.mode,c),b.return=a,b;if("object"===typeof b&&null!==b){switch(b.$$typeof){case Za:return c=Ug(b.type,b.key,b.props,null,a.mode,c),c.ref=Pg(a,null,b),c.return=a,c;case $a:return b=Vg(b,a.mode,c),b.return=a,b}if(Og(b)||
nb(b))return b=Wg(b,a.mode,c,null),b.return=a,b;Qg(a,b)}return null}function x(a,b,c,d){var e=null!==b?b.key:null;if("string"===typeof c||"number"===typeof c)return null!==e?null:h(a,b,""+c,d);if("object"===typeof c&&null!==c){switch(c.$$typeof){case Za:return c.key===e?c.type===ab?m(a,b,c.props.children,d,e):k(a,b,c,d):null;case $a:return c.key===e?l(a,b,c,d):null}if(Og(c)||nb(c))return null!==e?null:m(a,b,c,d,null);Qg(a,c)}return null}function z(a,b,c,d,e){if("string"===typeof d||"number"===typeof d)return a=
a.get(c)||null,h(b,a,""+d,e);if("object"===typeof d&&null!==d){switch(d.$$typeof){case Za:return a=a.get(null===d.key?c:d.key)||null,d.type===ab?m(b,a,d.props.children,e,d.key):k(b,a,d,e);case $a:return a=a.get(null===d.key?c:d.key)||null,l(b,a,d,e)}if(Og(d)||nb(d))return a=a.get(c)||null,m(b,a,d,e,null);Qg(b,d)}return null}function ca(e,g,h,k){for(var l=null,t=null,m=g,y=g=0,A=null;null!==m&&y<h.length;y++){m.index>y?(A=m,m=null):A=m.sibling;var q=x(e,m,h[y],k);if(null===q){null===m&&(m=A);break}a&&
m&&null===q.alternate&&b(e,m);g=f(q,g,y);null===t?l=q:t.sibling=q;t=q;m=A}if(y===h.length)return c(e,m),l;if(null===m){for(;y<h.length;y++)m=p(e,h[y],k),null!==m&&(g=f(m,g,y),null===t?l=m:t.sibling=m,t=m);return l}for(m=d(e,m);y<h.length;y++)A=z(m,e,y,h[y],k),null!==A&&(a&&null!==A.alternate&&m.delete(null===A.key?y:A.key),g=f(A,g,y),null===t?l=A:t.sibling=A,t=A);a&&m.forEach(function(a){return b(e,a)});return l}function D(e,g,h,l){var k=nb(h);if("function"!==typeof k)throw Error(u(150));h=k.call(h);
if(null==h)throw Error(u(151));for(var m=k=null,t=g,y=g=0,A=null,q=h.next();null!==t&&!q.done;y++,q=h.next()){t.index>y?(A=t,t=null):A=t.sibling;var D=x(e,t,q.value,l);if(null===D){null===t&&(t=A);break}a&&t&&null===D.alternate&&b(e,t);g=f(D,g,y);null===m?k=D:m.sibling=D;m=D;t=A}if(q.done)return c(e,t),k;if(null===t){for(;!q.done;y++,q=h.next())q=p(e,q.value,l),null!==q&&(g=f(q,g,y),null===m?k=q:m.sibling=q,m=q);return k}for(t=d(e,t);!q.done;y++,q=h.next())q=z(t,e,y,q.value,l),null!==q&&(a&&null!==
q.alternate&&t.delete(null===q.key?y:q.key),g=f(q,g,y),null===m?k=q:m.sibling=q,m=q);a&&t.forEach(function(a){return b(e,a)});return k}return function(a,d,f,h){var k="object"===typeof f&&null!==f&&f.type===ab&&null===f.key;k&&(f=f.props.children);var l="object"===typeof f&&null!==f;if(l)switch(f.$$typeof){case Za:a:{l=f.key;for(k=d;null!==k;){if(k.key===l){switch(k.tag){case 7:if(f.type===ab){c(a,k.sibling);d=e(k,f.props.children);d.return=a;a=d;break a}break;default:if(k.elementType===f.type){c(a,
k.sibling);d=e(k,f.props);d.ref=Pg(a,k,f);d.return=a;a=d;break a}}c(a,k);break}else b(a,k);k=k.sibling}f.type===ab?(d=Wg(f.props.children,a.mode,h,f.key),d.return=a,a=d):(h=Ug(f.type,f.key,f.props,null,a.mode,h),h.ref=Pg(a,d,f),h.return=a,a=h)}return g(a);case $a:a:{for(k=f.key;null!==d;){if(d.key===k)if(4===d.tag&&d.stateNode.containerInfo===f.containerInfo&&d.stateNode.implementation===f.implementation){c(a,d.sibling);d=e(d,f.children||[]);d.return=a;a=d;break a}else{c(a,d);break}else b(a,d);d=
d.sibling}d=Vg(f,a.mode,h);d.return=a;a=d}return g(a)}if("string"===typeof f||"number"===typeof f)return f=""+f,null!==d&&6===d.tag?(c(a,d.sibling),d=e(d,f),d.return=a,a=d):(c(a,d),d=Tg(f,a.mode,h),d.return=a,a=d),g(a);if(Og(f))return ca(a,d,f,h);if(nb(f))return D(a,d,f,h);l&&Qg(a,f);if("undefined"===typeof f&&!k)switch(a.tag){case 1:case 0:throw a=a.type,Error(u(152,a.displayName||a.name||"Component"));}return c(a,d)}}var Xg=Rg(!0),Yg=Rg(!1),Zg={},$g={current:Zg},ah={current:Zg},bh={current:Zg};
function ch(a){if(a===Zg)throw Error(u(174));return a}function dh(a,b){I(bh,b);I(ah,a);I($g,Zg);a=b.nodeType;switch(a){case 9:case 11:b=(b=b.documentElement)?b.namespaceURI:Ob(null,"");break;default:a=8===a?b.parentNode:b,b=a.namespaceURI||null,a=a.tagName,b=Ob(b,a)}H($g);I($g,b)}function eh(){H($g);H(ah);H(bh)}function fh(a){ch(bh.current);var b=ch($g.current);var c=Ob(b,a.type);b!==c&&(I(ah,a),I($g,c))}function gh(a){ah.current===a&&(H($g),H(ah))}var M={current:0};
function hh(a){for(var b=a;null!==b;){if(13===b.tag){var c=b.memoizedState;if(null!==c&&(c=c.dehydrated,null===c||c.data===Bd||c.data===Cd))return b}else if(19===b.tag&&void 0!==b.memoizedProps.revealOrder){if(0!==(b.effectTag&64))return b}else if(null!==b.child){b.child.return=b;b=b.child;continue}if(b===a)break;for(;null===b.sibling;){if(null===b.return||b.return===a)return null;b=b.return}b.sibling.return=b.return;b=b.sibling}return null}function ih(a,b){return{responder:a,props:b}}
var jh=Wa.ReactCurrentDispatcher,kh=Wa.ReactCurrentBatchConfig,lh=0,N=null,O=null,P=null,mh=!1;function Q(){throw Error(u(321));}function nh(a,b){if(null===b)return!1;for(var c=0;c<b.length&&c<a.length;c++)if(!$e(a[c],b[c]))return!1;return!0}
function oh(a,b,c,d,e,f){lh=f;N=b;b.memoizedState=null;b.updateQueue=null;b.expirationTime=0;jh.current=null===a||null===a.memoizedState?ph:qh;a=c(d,e);if(b.expirationTime===lh){f=0;do{b.expirationTime=0;if(!(25>f))throw Error(u(301));f+=1;P=O=null;b.updateQueue=null;jh.current=rh;a=c(d,e)}while(b.expirationTime===lh)}jh.current=sh;b=null!==O&&null!==O.next;lh=0;P=O=N=null;mh=!1;if(b)throw Error(u(300));return a}
function th(){var a={memoizedState:null,baseState:null,baseQueue:null,queue:null,next:null};null===P?N.memoizedState=P=a:P=P.next=a;return P}function uh(){if(null===O){var a=N.alternate;a=null!==a?a.memoizedState:null}else a=O.next;var b=null===P?N.memoizedState:P.next;if(null!==b)P=b,O=a;else{if(null===a)throw Error(u(310));O=a;a={memoizedState:O.memoizedState,baseState:O.baseState,baseQueue:O.baseQueue,queue:O.queue,next:null};null===P?N.memoizedState=P=a:P=P.next=a}return P}
function vh(a,b){return"function"===typeof b?b(a):b}
function wh(a){var b=uh(),c=b.queue;if(null===c)throw Error(u(311));c.lastRenderedReducer=a;var d=O,e=d.baseQueue,f=c.pending;if(null!==f){if(null!==e){var g=e.next;e.next=f.next;f.next=g}d.baseQueue=e=f;c.pending=null}if(null!==e){e=e.next;d=d.baseState;var h=g=f=null,k=e;do{var l=k.expirationTime;if(l<lh){var m={expirationTime:k.expirationTime,suspenseConfig:k.suspenseConfig,action:k.action,eagerReducer:k.eagerReducer,eagerState:k.eagerState,next:null};null===h?(g=h=m,f=d):h=h.next=m;l>N.expirationTime&&
(N.expirationTime=l,Bg(l))}else null!==h&&(h=h.next={expirationTime:1073741823,suspenseConfig:k.suspenseConfig,action:k.action,eagerReducer:k.eagerReducer,eagerState:k.eagerState,next:null}),Ag(l,k.suspenseConfig),d=k.eagerReducer===a?k.eagerState:a(d,k.action);k=k.next}while(null!==k&&k!==e);null===h?f=d:h.next=g;$e(d,b.memoizedState)||(rg=!0);b.memoizedState=d;b.baseState=f;b.baseQueue=h;c.lastRenderedState=d}return[b.memoizedState,c.dispatch]}
function xh(a){var b=uh(),c=b.queue;if(null===c)throw Error(u(311));c.lastRenderedReducer=a;var d=c.dispatch,e=c.pending,f=b.memoizedState;if(null!==e){c.pending=null;var g=e=e.next;do f=a(f,g.action),g=g.next;while(g!==e);$e(f,b.memoizedState)||(rg=!0);b.memoizedState=f;null===b.baseQueue&&(b.baseState=f);c.lastRenderedState=f}return[f,d]}
function yh(a){var b=th();"function"===typeof a&&(a=a());b.memoizedState=b.baseState=a;a=b.queue={pending:null,dispatch:null,lastRenderedReducer:vh,lastRenderedState:a};a=a.dispatch=zh.bind(null,N,a);return[b.memoizedState,a]}function Ah(a,b,c,d){a={tag:a,create:b,destroy:c,deps:d,next:null};b=N.updateQueue;null===b?(b={lastEffect:null},N.updateQueue=b,b.lastEffect=a.next=a):(c=b.lastEffect,null===c?b.lastEffect=a.next=a:(d=c.next,c.next=a,a.next=d,b.lastEffect=a));return a}
function Bh(){return uh().memoizedState}function Ch(a,b,c,d){var e=th();N.effectTag|=a;e.memoizedState=Ah(1|b,c,void 0,void 0===d?null:d)}function Dh(a,b,c,d){var e=uh();d=void 0===d?null:d;var f=void 0;if(null!==O){var g=O.memoizedState;f=g.destroy;if(null!==d&&nh(d,g.deps)){Ah(b,c,f,d);return}}N.effectTag|=a;e.memoizedState=Ah(1|b,c,f,d)}function Eh(a,b){return Ch(516,4,a,b)}function Fh(a,b){return Dh(516,4,a,b)}function Gh(a,b){return Dh(4,2,a,b)}
function Hh(a,b){if("function"===typeof b)return a=a(),b(a),function(){b(null)};if(null!==b&&void 0!==b)return a=a(),b.current=a,function(){b.current=null}}function Ih(a,b,c){c=null!==c&&void 0!==c?c.concat([a]):null;return Dh(4,2,Hh.bind(null,b,a),c)}function Jh(){}function Kh(a,b){th().memoizedState=[a,void 0===b?null:b];return a}function Lh(a,b){var c=uh();b=void 0===b?null:b;var d=c.memoizedState;if(null!==d&&null!==b&&nh(b,d[1]))return d[0];c.memoizedState=[a,b];return a}
function Mh(a,b){var c=uh();b=void 0===b?null:b;var d=c.memoizedState;if(null!==d&&null!==b&&nh(b,d[1]))return d[0];a=a();c.memoizedState=[a,b];return a}function Nh(a,b,c){var d=ag();cg(98>d?98:d,function(){a(!0)});cg(97<d?97:d,function(){var d=kh.suspense;kh.suspense=void 0===b?null:b;try{a(!1),c()}finally{kh.suspense=d}})}
function zh(a,b,c){var d=Gg(),e=Dg.suspense;d=Hg(d,a,e);e={expirationTime:d,suspenseConfig:e,action:c,eagerReducer:null,eagerState:null,next:null};var f=b.pending;null===f?e.next=e:(e.next=f.next,f.next=e);b.pending=e;f=a.alternate;if(a===N||null!==f&&f===N)mh=!0,e.expirationTime=lh,N.expirationTime=lh;else{if(0===a.expirationTime&&(null===f||0===f.expirationTime)&&(f=b.lastRenderedReducer,null!==f))try{var g=b.lastRenderedState,h=f(g,c);e.eagerReducer=f;e.eagerState=h;if($e(h,g))return}catch(k){}finally{}Ig(a,
d)}}
var sh={readContext:sg,useCallback:Q,useContext:Q,useEffect:Q,useImperativeHandle:Q,useLayoutEffect:Q,useMemo:Q,useReducer:Q,useRef:Q,useState:Q,useDebugValue:Q,useResponder:Q,useDeferredValue:Q,useTransition:Q},ph={readContext:sg,useCallback:Kh,useContext:sg,useEffect:Eh,useImperativeHandle:function(a,b,c){c=null!==c&&void 0!==c?c.concat([a]):null;return Ch(4,2,Hh.bind(null,b,a),c)},useLayoutEffect:function(a,b){return Ch(4,2,a,b)},useMemo:function(a,b){var c=th();b=void 0===b?null:b;a=a();c.memoizedState=[a,
b];return a},useReducer:function(a,b,c){var d=th();b=void 0!==c?c(b):b;d.memoizedState=d.baseState=b;a=d.queue={pending:null,dispatch:null,lastRenderedReducer:a,lastRenderedState:b};a=a.dispatch=zh.bind(null,N,a);return[d.memoizedState,a]},useRef:function(a){var b=th();a={current:a};return b.memoizedState=a},useState:yh,useDebugValue:Jh,useResponder:ih,useDeferredValue:function(a,b){var c=yh(a),d=c[0],e=c[1];Eh(function(){var c=kh.suspense;kh.suspense=void 0===b?null:b;try{e(a)}finally{kh.suspense=
c}},[a,b]);return d},useTransition:function(a){var b=yh(!1),c=b[0];b=b[1];return[Kh(Nh.bind(null,b,a),[b,a]),c]}},qh={readContext:sg,useCallback:Lh,useContext:sg,useEffect:Fh,useImperativeHandle:Ih,useLayoutEffect:Gh,useMemo:Mh,useReducer:wh,useRef:Bh,useState:function(){return wh(vh)},useDebugValue:Jh,useResponder:ih,useDeferredValue:function(a,b){var c=wh(vh),d=c[0],e=c[1];Fh(function(){var c=kh.suspense;kh.suspense=void 0===b?null:b;try{e(a)}finally{kh.suspense=c}},[a,b]);return d},useTransition:function(a){var b=
wh(vh),c=b[0];b=b[1];return[Lh(Nh.bind(null,b,a),[b,a]),c]}},rh={readContext:sg,useCallback:Lh,useContext:sg,useEffect:Fh,useImperativeHandle:Ih,useLayoutEffect:Gh,useMemo:Mh,useReducer:xh,useRef:Bh,useState:function(){return xh(vh)},useDebugValue:Jh,useResponder:ih,useDeferredValue:function(a,b){var c=xh(vh),d=c[0],e=c[1];Fh(function(){var c=kh.suspense;kh.suspense=void 0===b?null:b;try{e(a)}finally{kh.suspense=c}},[a,b]);return d},useTransition:function(a){var b=xh(vh),c=b[0];b=b[1];return[Lh(Nh.bind(null,
b,a),[b,a]),c]}},Oh=null,Ph=null,Qh=!1;function Rh(a,b){var c=Sh(5,null,null,0);c.elementType="DELETED";c.type="DELETED";c.stateNode=b;c.return=a;c.effectTag=8;null!==a.lastEffect?(a.lastEffect.nextEffect=c,a.lastEffect=c):a.firstEffect=a.lastEffect=c}
function Th(a,b){switch(a.tag){case 5:var c=a.type;b=1!==b.nodeType||c.toLowerCase()!==b.nodeName.toLowerCase()?null:b;return null!==b?(a.stateNode=b,!0):!1;case 6:return b=""===a.pendingProps||3!==b.nodeType?null:b,null!==b?(a.stateNode=b,!0):!1;case 13:return!1;default:return!1}}
function Uh(a){if(Qh){var b=Ph;if(b){var c=b;if(!Th(a,b)){b=Jd(c.nextSibling);if(!b||!Th(a,b)){a.effectTag=a.effectTag&-1025|2;Qh=!1;Oh=a;return}Rh(Oh,c)}Oh=a;Ph=Jd(b.firstChild)}else a.effectTag=a.effectTag&-1025|2,Qh=!1,Oh=a}}function Vh(a){for(a=a.return;null!==a&&5!==a.tag&&3!==a.tag&&13!==a.tag;)a=a.return;Oh=a}
function Wh(a){if(a!==Oh)return!1;if(!Qh)return Vh(a),Qh=!0,!1;var b=a.type;if(5!==a.tag||"head"!==b&&"body"!==b&&!Gd(b,a.memoizedProps))for(b=Ph;b;)Rh(a,b),b=Jd(b.nextSibling);Vh(a);if(13===a.tag){a=a.memoizedState;a=null!==a?a.dehydrated:null;if(!a)throw Error(u(317));a:{a=a.nextSibling;for(b=0;a;){if(8===a.nodeType){var c=a.data;if(c===Ad){if(0===b){Ph=Jd(a.nextSibling);break a}b--}else c!==zd&&c!==Cd&&c!==Bd||b++}a=a.nextSibling}Ph=null}}else Ph=Oh?Jd(a.stateNode.nextSibling):null;return!0}
function Xh(){Ph=Oh=null;Qh=!1}var Yh=Wa.ReactCurrentOwner,rg=!1;function R(a,b,c,d){b.child=null===a?Yg(b,null,c,d):Xg(b,a.child,c,d)}function Zh(a,b,c,d,e){c=c.render;var f=b.ref;qg(b,e);d=oh(a,b,c,d,f,e);if(null!==a&&!rg)return b.updateQueue=a.updateQueue,b.effectTag&=-517,a.expirationTime<=e&&(a.expirationTime=0),$h(a,b,e);b.effectTag|=1;R(a,b,d,e);return b.child}
function ai(a,b,c,d,e,f){if(null===a){var g=c.type;if("function"===typeof g&&!bi(g)&&void 0===g.defaultProps&&null===c.compare&&void 0===c.defaultProps)return b.tag=15,b.type=g,ci(a,b,g,d,e,f);a=Ug(c.type,null,d,null,b.mode,f);a.ref=b.ref;a.return=b;return b.child=a}g=a.child;if(e<f&&(e=g.memoizedProps,c=c.compare,c=null!==c?c:bf,c(e,d)&&a.ref===b.ref))return $h(a,b,f);b.effectTag|=1;a=Sg(g,d);a.ref=b.ref;a.return=b;return b.child=a}
function ci(a,b,c,d,e,f){return null!==a&&bf(a.memoizedProps,d)&&a.ref===b.ref&&(rg=!1,e<f)?(b.expirationTime=a.expirationTime,$h(a,b,f)):di(a,b,c,d,f)}function ei(a,b){var c=b.ref;if(null===a&&null!==c||null!==a&&a.ref!==c)b.effectTag|=128}function di(a,b,c,d,e){var f=L(c)?Bf:J.current;f=Cf(b,f);qg(b,e);c=oh(a,b,c,d,f,e);if(null!==a&&!rg)return b.updateQueue=a.updateQueue,b.effectTag&=-517,a.expirationTime<=e&&(a.expirationTime=0),$h(a,b,e);b.effectTag|=1;R(a,b,c,e);return b.child}
function fi(a,b,c,d,e){if(L(c)){var f=!0;Gf(b)}else f=!1;qg(b,e);if(null===b.stateNode)null!==a&&(a.alternate=null,b.alternate=null,b.effectTag|=2),Lg(b,c,d),Ng(b,c,d,e),d=!0;else if(null===a){var g=b.stateNode,h=b.memoizedProps;g.props=h;var k=g.context,l=c.contextType;"object"===typeof l&&null!==l?l=sg(l):(l=L(c)?Bf:J.current,l=Cf(b,l));var m=c.getDerivedStateFromProps,p="function"===typeof m||"function"===typeof g.getSnapshotBeforeUpdate;p||"function"!==typeof g.UNSAFE_componentWillReceiveProps&&
"function"!==typeof g.componentWillReceiveProps||(h!==d||k!==l)&&Mg(b,g,d,l);tg=!1;var x=b.memoizedState;g.state=x;zg(b,d,g,e);k=b.memoizedState;h!==d||x!==k||K.current||tg?("function"===typeof m&&(Fg(b,c,m,d),k=b.memoizedState),(h=tg||Kg(b,c,h,d,x,k,l))?(p||"function"!==typeof g.UNSAFE_componentWillMount&&"function"!==typeof g.componentWillMount||("function"===typeof g.componentWillMount&&g.componentWillMount(),"function"===typeof g.UNSAFE_componentWillMount&&g.UNSAFE_componentWillMount()),"function"===
typeof g.componentDidMount&&(b.effectTag|=4)):("function"===typeof g.componentDidMount&&(b.effectTag|=4),b.memoizedProps=d,b.memoizedState=k),g.props=d,g.state=k,g.context=l,d=h):("function"===typeof g.componentDidMount&&(b.effectTag|=4),d=!1)}else g=b.stateNode,vg(a,b),h=b.memoizedProps,g.props=b.type===b.elementType?h:ig(b.type,h),k=g.context,l=c.contextType,"object"===typeof l&&null!==l?l=sg(l):(l=L(c)?Bf:J.current,l=Cf(b,l)),m=c.getDerivedStateFromProps,(p="function"===typeof m||"function"===
typeof g.getSnapshotBeforeUpdate)||"function"!==typeof g.UNSAFE_componentWillReceiveProps&&"function"!==typeof g.componentWillReceiveProps||(h!==d||k!==l)&&Mg(b,g,d,l),tg=!1,k=b.memoizedState,g.state=k,zg(b,d,g,e),x=b.memoizedState,h!==d||k!==x||K.current||tg?("function"===typeof m&&(Fg(b,c,m,d),x=b.memoizedState),(m=tg||Kg(b,c,h,d,k,x,l))?(p||"function"!==typeof g.UNSAFE_componentWillUpdate&&"function"!==typeof g.componentWillUpdate||("function"===typeof g.componentWillUpdate&&g.componentWillUpdate(d,
x,l),"function"===typeof g.UNSAFE_componentWillUpdate&&g.UNSAFE_componentWillUpdate(d,x,l)),"function"===typeof g.componentDidUpdate&&(b.effectTag|=4),"function"===typeof g.getSnapshotBeforeUpdate&&(b.effectTag|=256)):("function"!==typeof g.componentDidUpdate||h===a.memoizedProps&&k===a.memoizedState||(b.effectTag|=4),"function"!==typeof g.getSnapshotBeforeUpdate||h===a.memoizedProps&&k===a.memoizedState||(b.effectTag|=256),b.memoizedProps=d,b.memoizedState=x),g.props=d,g.state=x,g.context=l,d=m):
("function"!==typeof g.componentDidUpdate||h===a.memoizedProps&&k===a.memoizedState||(b.effectTag|=4),"function"!==typeof g.getSnapshotBeforeUpdate||h===a.memoizedProps&&k===a.memoizedState||(b.effectTag|=256),d=!1);return gi(a,b,c,d,f,e)}
function gi(a,b,c,d,e,f){ei(a,b);var g=0!==(b.effectTag&64);if(!d&&!g)return e&&Hf(b,c,!1),$h(a,b,f);d=b.stateNode;Yh.current=b;var h=g&&"function"!==typeof c.getDerivedStateFromError?null:d.render();b.effectTag|=1;null!==a&&g?(b.child=Xg(b,a.child,null,f),b.child=Xg(b,null,h,f)):R(a,b,h,f);b.memoizedState=d.state;e&&Hf(b,c,!0);return b.child}function hi(a){var b=a.stateNode;b.pendingContext?Ef(a,b.pendingContext,b.pendingContext!==b.context):b.context&&Ef(a,b.context,!1);dh(a,b.containerInfo)}
var ii={dehydrated:null,retryTime:0};
function ji(a,b,c){var d=b.mode,e=b.pendingProps,f=M.current,g=!1,h;(h=0!==(b.effectTag&64))||(h=0!==(f&2)&&(null===a||null!==a.memoizedState));h?(g=!0,b.effectTag&=-65):null!==a&&null===a.memoizedState||void 0===e.fallback||!0===e.unstable_avoidThisFallback||(f|=1);I(M,f&1);if(null===a){void 0!==e.fallback&&Uh(b);if(g){g=e.fallback;e=Wg(null,d,0,null);e.return=b;if(0===(b.mode&2))for(a=null!==b.memoizedState?b.child.child:b.child,e.child=a;null!==a;)a.return=e,a=a.sibling;c=Wg(g,d,c,null);c.return=
b;e.sibling=c;b.memoizedState=ii;b.child=e;return c}d=e.children;b.memoizedState=null;return b.child=Yg(b,null,d,c)}if(null!==a.memoizedState){a=a.child;d=a.sibling;if(g){e=e.fallback;c=Sg(a,a.pendingProps);c.return=b;if(0===(b.mode&2)&&(g=null!==b.memoizedState?b.child.child:b.child,g!==a.child))for(c.child=g;null!==g;)g.return=c,g=g.sibling;d=Sg(d,e);d.return=b;c.sibling=d;c.childExpirationTime=0;b.memoizedState=ii;b.child=c;return d}c=Xg(b,a.child,e.children,c);b.memoizedState=null;return b.child=
c}a=a.child;if(g){g=e.fallback;e=Wg(null,d,0,null);e.return=b;e.child=a;null!==a&&(a.return=e);if(0===(b.mode&2))for(a=null!==b.memoizedState?b.child.child:b.child,e.child=a;null!==a;)a.return=e,a=a.sibling;c=Wg(g,d,c,null);c.return=b;e.sibling=c;c.effectTag|=2;e.childExpirationTime=0;b.memoizedState=ii;b.child=e;return c}b.memoizedState=null;return b.child=Xg(b,a,e.children,c)}
function ki(a,b){a.expirationTime<b&&(a.expirationTime=b);var c=a.alternate;null!==c&&c.expirationTime<b&&(c.expirationTime=b);pg(a.return,b)}function li(a,b,c,d,e,f){var g=a.memoizedState;null===g?a.memoizedState={isBackwards:b,rendering:null,renderingStartTime:0,last:d,tail:c,tailExpiration:0,tailMode:e,lastEffect:f}:(g.isBackwards=b,g.rendering=null,g.renderingStartTime=0,g.last=d,g.tail=c,g.tailExpiration=0,g.tailMode=e,g.lastEffect=f)}
function mi(a,b,c){var d=b.pendingProps,e=d.revealOrder,f=d.tail;R(a,b,d.children,c);d=M.current;if(0!==(d&2))d=d&1|2,b.effectTag|=64;else{if(null!==a&&0!==(a.effectTag&64))a:for(a=b.child;null!==a;){if(13===a.tag)null!==a.memoizedState&&ki(a,c);else if(19===a.tag)ki(a,c);else if(null!==a.child){a.child.return=a;a=a.child;continue}if(a===b)break a;for(;null===a.sibling;){if(null===a.return||a.return===b)break a;a=a.return}a.sibling.return=a.return;a=a.sibling}d&=1}I(M,d);if(0===(b.mode&2))b.memoizedState=
null;else switch(e){case "forwards":c=b.child;for(e=null;null!==c;)a=c.alternate,null!==a&&null===hh(a)&&(e=c),c=c.sibling;c=e;null===c?(e=b.child,b.child=null):(e=c.sibling,c.sibling=null);li(b,!1,e,c,f,b.lastEffect);break;case "backwards":c=null;e=b.child;for(b.child=null;null!==e;){a=e.alternate;if(null!==a&&null===hh(a)){b.child=e;break}a=e.sibling;e.sibling=c;c=e;e=a}li(b,!0,c,null,f,b.lastEffect);break;case "together":li(b,!1,null,null,void 0,b.lastEffect);break;default:b.memoizedState=null}return b.child}
function $h(a,b,c){null!==a&&(b.dependencies=a.dependencies);var d=b.expirationTime;0!==d&&Bg(d);if(b.childExpirationTime<c)return null;if(null!==a&&b.child!==a.child)throw Error(u(153));if(null!==b.child){a=b.child;c=Sg(a,a.pendingProps);b.child=c;for(c.return=b;null!==a.sibling;)a=a.sibling,c=c.sibling=Sg(a,a.pendingProps),c.return=b;c.sibling=null}return b.child}var ni,oi,pi,qi;
ni=function(a,b){for(var c=b.child;null!==c;){if(5===c.tag||6===c.tag)a.appendChild(c.stateNode);else if(4!==c.tag&&null!==c.child){c.child.return=c;c=c.child;continue}if(c===b)break;for(;null===c.sibling;){if(null===c.return||c.return===b)return;c=c.return}c.sibling.return=c.return;c=c.sibling}};oi=function(){};
pi=function(a,b,c,d,e){var f=a.memoizedProps;if(f!==d){var g=b.stateNode;ch($g.current);a=null;switch(c){case "input":f=zb(g,f);d=zb(g,d);a=[];break;case "option":f=Gb(g,f);d=Gb(g,d);a=[];break;case "select":f=n({},f,{value:void 0});d=n({},d,{value:void 0});a=[];break;case "textarea":f=Ib(g,f);d=Ib(g,d);a=[];break;default:"function"!==typeof f.onClick&&"function"===typeof d.onClick&&(g.onclick=sd)}od(c,d);var h,k;c=null;for(h in f)if(!d.hasOwnProperty(h)&&f.hasOwnProperty(h)&&null!=f[h])if("style"===
h)for(k in g=f[h],g)g.hasOwnProperty(k)&&(c||(c={}),c[k]="");else"dangerouslySetInnerHTML"!==h&&"children"!==h&&"suppressContentEditableWarning"!==h&&"suppressHydrationWarning"!==h&&"autoFocus"!==h&&(va.hasOwnProperty(h)?a||(a=[]):(a=a||[]).push(h,null));for(h in d){var l=d[h];g=null!=f?f[h]:void 0;if(d.hasOwnProperty(h)&&l!==g&&(null!=l||null!=g))if("style"===h)if(g){for(k in g)!g.hasOwnProperty(k)||l&&l.hasOwnProperty(k)||(c||(c={}),c[k]="");for(k in l)l.hasOwnProperty(k)&&g[k]!==l[k]&&(c||(c={}),
c[k]=l[k])}else c||(a||(a=[]),a.push(h,c)),c=l;else"dangerouslySetInnerHTML"===h?(l=l?l.__html:void 0,g=g?g.__html:void 0,null!=l&&g!==l&&(a=a||[]).push(h,l)):"children"===h?g===l||"string"!==typeof l&&"number"!==typeof l||(a=a||[]).push(h,""+l):"suppressContentEditableWarning"!==h&&"suppressHydrationWarning"!==h&&(va.hasOwnProperty(h)?(null!=l&&rd(e,h),a||g===l||(a=[])):(a=a||[]).push(h,l))}c&&(a=a||[]).push("style",c);e=a;if(b.updateQueue=e)b.effectTag|=4}};
qi=function(a,b,c,d){c!==d&&(b.effectTag|=4)};function ri(a,b){switch(a.tailMode){case "hidden":b=a.tail;for(var c=null;null!==b;)null!==b.alternate&&(c=b),b=b.sibling;null===c?a.tail=null:c.sibling=null;break;case "collapsed":c=a.tail;for(var d=null;null!==c;)null!==c.alternate&&(d=c),c=c.sibling;null===d?b||null===a.tail?a.tail=null:a.tail.sibling=null:d.sibling=null}}
function si(a,b,c){var d=b.pendingProps;switch(b.tag){case 2:case 16:case 15:case 0:case 11:case 7:case 8:case 12:case 9:case 14:return null;case 1:return L(b.type)&&Df(),null;case 3:return eh(),H(K),H(J),c=b.stateNode,c.pendingContext&&(c.context=c.pendingContext,c.pendingContext=null),null!==a&&null!==a.child||!Wh(b)||(b.effectTag|=4),oi(b),null;case 5:gh(b);c=ch(bh.current);var e=b.type;if(null!==a&&null!=b.stateNode)pi(a,b,e,d,c),a.ref!==b.ref&&(b.effectTag|=128);else{if(!d){if(null===b.stateNode)throw Error(u(166));
return null}a=ch($g.current);if(Wh(b)){d=b.stateNode;e=b.type;var f=b.memoizedProps;d[Md]=b;d[Nd]=f;switch(e){case "iframe":case "object":case "embed":F("load",d);break;case "video":case "audio":for(a=0;a<ac.length;a++)F(ac[a],d);break;case "source":F("error",d);break;case "img":case "image":case "link":F("error",d);F("load",d);break;case "form":F("reset",d);F("submit",d);break;case "details":F("toggle",d);break;case "input":Ab(d,f);F("invalid",d);rd(c,"onChange");break;case "select":d._wrapperState=
{wasMultiple:!!f.multiple};F("invalid",d);rd(c,"onChange");break;case "textarea":Jb(d,f),F("invalid",d),rd(c,"onChange")}od(e,f);a=null;for(var g in f)if(f.hasOwnProperty(g)){var h=f[g];"children"===g?"string"===typeof h?d.textContent!==h&&(a=["children",h]):"number"===typeof h&&d.textContent!==""+h&&(a=["children",""+h]):va.hasOwnProperty(g)&&null!=h&&rd(c,g)}switch(e){case "input":xb(d);Eb(d,f,!0);break;case "textarea":xb(d);Lb(d);break;case "select":case "option":break;default:"function"===typeof f.onClick&&
(d.onclick=sd)}c=a;b.updateQueue=c;null!==c&&(b.effectTag|=4)}else{g=9===c.nodeType?c:c.ownerDocument;a===qd&&(a=Nb(e));a===qd?"script"===e?(a=g.createElement("div"),a.innerHTML="<script>\x3c/script>",a=a.removeChild(a.firstChild)):"string"===typeof d.is?a=g.createElement(e,{is:d.is}):(a=g.createElement(e),"select"===e&&(g=a,d.multiple?g.multiple=!0:d.size&&(g.size=d.size))):a=g.createElementNS(a,e);a[Md]=b;a[Nd]=d;ni(a,b,!1,!1);b.stateNode=a;g=pd(e,d);switch(e){case "iframe":case "object":case "embed":F("load",
a);h=d;break;case "video":case "audio":for(h=0;h<ac.length;h++)F(ac[h],a);h=d;break;case "source":F("error",a);h=d;break;case "img":case "image":case "link":F("error",a);F("load",a);h=d;break;case "form":F("reset",a);F("submit",a);h=d;break;case "details":F("toggle",a);h=d;break;case "input":Ab(a,d);h=zb(a,d);F("invalid",a);rd(c,"onChange");break;case "option":h=Gb(a,d);break;case "select":a._wrapperState={wasMultiple:!!d.multiple};h=n({},d,{value:void 0});F("invalid",a);rd(c,"onChange");break;case "textarea":Jb(a,
d);h=Ib(a,d);F("invalid",a);rd(c,"onChange");break;default:h=d}od(e,h);var k=h;for(f in k)if(k.hasOwnProperty(f)){var l=k[f];"style"===f?md(a,l):"dangerouslySetInnerHTML"===f?(l=l?l.__html:void 0,null!=l&&Qb(a,l)):"children"===f?"string"===typeof l?("textarea"!==e||""!==l)&&Rb(a,l):"number"===typeof l&&Rb(a,""+l):"suppressContentEditableWarning"!==f&&"suppressHydrationWarning"!==f&&"autoFocus"!==f&&(va.hasOwnProperty(f)?null!=l&&rd(c,f):null!=l&&Xa(a,f,l,g))}switch(e){case "input":xb(a);Eb(a,d,!1);
break;case "textarea":xb(a);Lb(a);break;case "option":null!=d.value&&a.setAttribute("value",""+rb(d.value));break;case "select":a.multiple=!!d.multiple;c=d.value;null!=c?Hb(a,!!d.multiple,c,!1):null!=d.defaultValue&&Hb(a,!!d.multiple,d.defaultValue,!0);break;default:"function"===typeof h.onClick&&(a.onclick=sd)}Fd(e,d)&&(b.effectTag|=4)}null!==b.ref&&(b.effectTag|=128)}return null;case 6:if(a&&null!=b.stateNode)qi(a,b,a.memoizedProps,d);else{if("string"!==typeof d&&null===b.stateNode)throw Error(u(166));
c=ch(bh.current);ch($g.current);Wh(b)?(c=b.stateNode,d=b.memoizedProps,c[Md]=b,c.nodeValue!==d&&(b.effectTag|=4)):(c=(9===c.nodeType?c:c.ownerDocument).createTextNode(d),c[Md]=b,b.stateNode=c)}return null;case 13:H(M);d=b.memoizedState;if(0!==(b.effectTag&64))return b.expirationTime=c,b;c=null!==d;d=!1;null===a?void 0!==b.memoizedProps.fallback&&Wh(b):(e=a.memoizedState,d=null!==e,c||null===e||(e=a.child.sibling,null!==e&&(f=b.firstEffect,null!==f?(b.firstEffect=e,e.nextEffect=f):(b.firstEffect=b.lastEffect=
e,e.nextEffect=null),e.effectTag=8)));if(c&&!d&&0!==(b.mode&2))if(null===a&&!0!==b.memoizedProps.unstable_avoidThisFallback||0!==(M.current&1))S===ti&&(S=ui);else{if(S===ti||S===ui)S=vi;0!==wi&&null!==T&&(xi(T,U),yi(T,wi))}if(c||d)b.effectTag|=4;return null;case 4:return eh(),oi(b),null;case 10:return og(b),null;case 17:return L(b.type)&&Df(),null;case 19:H(M);d=b.memoizedState;if(null===d)return null;e=0!==(b.effectTag&64);f=d.rendering;if(null===f)if(e)ri(d,!1);else{if(S!==ti||null!==a&&0!==(a.effectTag&
64))for(f=b.child;null!==f;){a=hh(f);if(null!==a){b.effectTag|=64;ri(d,!1);e=a.updateQueue;null!==e&&(b.updateQueue=e,b.effectTag|=4);null===d.lastEffect&&(b.firstEffect=null);b.lastEffect=d.lastEffect;for(d=b.child;null!==d;)e=d,f=c,e.effectTag&=2,e.nextEffect=null,e.firstEffect=null,e.lastEffect=null,a=e.alternate,null===a?(e.childExpirationTime=0,e.expirationTime=f,e.child=null,e.memoizedProps=null,e.memoizedState=null,e.updateQueue=null,e.dependencies=null):(e.childExpirationTime=a.childExpirationTime,
e.expirationTime=a.expirationTime,e.child=a.child,e.memoizedProps=a.memoizedProps,e.memoizedState=a.memoizedState,e.updateQueue=a.updateQueue,f=a.dependencies,e.dependencies=null===f?null:{expirationTime:f.expirationTime,firstContext:f.firstContext,responders:f.responders}),d=d.sibling;I(M,M.current&1|2);return b.child}f=f.sibling}}else{if(!e)if(a=hh(f),null!==a){if(b.effectTag|=64,e=!0,c=a.updateQueue,null!==c&&(b.updateQueue=c,b.effectTag|=4),ri(d,!0),null===d.tail&&"hidden"===d.tailMode&&!f.alternate)return b=
b.lastEffect=d.lastEffect,null!==b&&(b.nextEffect=null),null}else 2*$f()-d.renderingStartTime>d.tailExpiration&&1<c&&(b.effectTag|=64,e=!0,ri(d,!1),b.expirationTime=b.childExpirationTime=c-1);d.isBackwards?(f.sibling=b.child,b.child=f):(c=d.last,null!==c?c.sibling=f:b.child=f,d.last=f)}return null!==d.tail?(0===d.tailExpiration&&(d.tailExpiration=$f()+500),c=d.tail,d.rendering=c,d.tail=c.sibling,d.lastEffect=b.lastEffect,d.renderingStartTime=$f(),c.sibling=null,b=M.current,I(M,e?b&1|2:b&1),c):null}throw Error(u(156,
b.tag));}function zi(a){switch(a.tag){case 1:L(a.type)&&Df();var b=a.effectTag;return b&4096?(a.effectTag=b&-4097|64,a):null;case 3:eh();H(K);H(J);b=a.effectTag;if(0!==(b&64))throw Error(u(285));a.effectTag=b&-4097|64;return a;case 5:return gh(a),null;case 13:return H(M),b=a.effectTag,b&4096?(a.effectTag=b&-4097|64,a):null;case 19:return H(M),null;case 4:return eh(),null;case 10:return og(a),null;default:return null}}function Ai(a,b){return{value:a,source:b,stack:qb(b)}}
var Bi="function"===typeof WeakSet?WeakSet:Set;function Ci(a,b){var c=b.source,d=b.stack;null===d&&null!==c&&(d=qb(c));null!==c&&pb(c.type);b=b.value;null!==a&&1===a.tag&&pb(a.type);try{console.error(b)}catch(e){setTimeout(function(){throw e;})}}function Di(a,b){try{b.props=a.memoizedProps,b.state=a.memoizedState,b.componentWillUnmount()}catch(c){Ei(a,c)}}function Fi(a){var b=a.ref;if(null!==b)if("function"===typeof b)try{b(null)}catch(c){Ei(a,c)}else b.current=null}
function Gi(a,b){switch(b.tag){case 0:case 11:case 15:case 22:return;case 1:if(b.effectTag&256&&null!==a){var c=a.memoizedProps,d=a.memoizedState;a=b.stateNode;b=a.getSnapshotBeforeUpdate(b.elementType===b.type?c:ig(b.type,c),d);a.__reactInternalSnapshotBeforeUpdate=b}return;case 3:case 5:case 6:case 4:case 17:return}throw Error(u(163));}
function Hi(a,b){b=b.updateQueue;b=null!==b?b.lastEffect:null;if(null!==b){var c=b=b.next;do{if((c.tag&a)===a){var d=c.destroy;c.destroy=void 0;void 0!==d&&d()}c=c.next}while(c!==b)}}function Ii(a,b){b=b.updateQueue;b=null!==b?b.lastEffect:null;if(null!==b){var c=b=b.next;do{if((c.tag&a)===a){var d=c.create;c.destroy=d()}c=c.next}while(c!==b)}}
function Ji(a,b,c){switch(c.tag){case 0:case 11:case 15:case 22:Ii(3,c);return;case 1:a=c.stateNode;if(c.effectTag&4)if(null===b)a.componentDidMount();else{var d=c.elementType===c.type?b.memoizedProps:ig(c.type,b.memoizedProps);a.componentDidUpdate(d,b.memoizedState,a.__reactInternalSnapshotBeforeUpdate)}b=c.updateQueue;null!==b&&Cg(c,b,a);return;case 3:b=c.updateQueue;if(null!==b){a=null;if(null!==c.child)switch(c.child.tag){case 5:a=c.child.stateNode;break;case 1:a=c.child.stateNode}Cg(c,b,a)}return;
case 5:a=c.stateNode;null===b&&c.effectTag&4&&Fd(c.type,c.memoizedProps)&&a.focus();return;case 6:return;case 4:return;case 12:return;case 13:null===c.memoizedState&&(c=c.alternate,null!==c&&(c=c.memoizedState,null!==c&&(c=c.dehydrated,null!==c&&Vc(c))));return;case 19:case 17:case 20:case 21:return}throw Error(u(163));}
function Ki(a,b,c){"function"===typeof Li&&Li(b);switch(b.tag){case 0:case 11:case 14:case 15:case 22:a=b.updateQueue;if(null!==a&&(a=a.lastEffect,null!==a)){var d=a.next;cg(97<c?97:c,function(){var a=d;do{var c=a.destroy;if(void 0!==c){var g=b;try{c()}catch(h){Ei(g,h)}}a=a.next}while(a!==d)})}break;case 1:Fi(b);c=b.stateNode;"function"===typeof c.componentWillUnmount&&Di(b,c);break;case 5:Fi(b);break;case 4:Mi(a,b,c)}}
function Ni(a){var b=a.alternate;a.return=null;a.child=null;a.memoizedState=null;a.updateQueue=null;a.dependencies=null;a.alternate=null;a.firstEffect=null;a.lastEffect=null;a.pendingProps=null;a.memoizedProps=null;a.stateNode=null;null!==b&&Ni(b)}function Oi(a){return 5===a.tag||3===a.tag||4===a.tag}
function Pi(a){a:{for(var b=a.return;null!==b;){if(Oi(b)){var c=b;break a}b=b.return}throw Error(u(160));}b=c.stateNode;switch(c.tag){case 5:var d=!1;break;case 3:b=b.containerInfo;d=!0;break;case 4:b=b.containerInfo;d=!0;break;default:throw Error(u(161));}c.effectTag&16&&(Rb(b,""),c.effectTag&=-17);a:b:for(c=a;;){for(;null===c.sibling;){if(null===c.return||Oi(c.return)){c=null;break a}c=c.return}c.sibling.return=c.return;for(c=c.sibling;5!==c.tag&&6!==c.tag&&18!==c.tag;){if(c.effectTag&2)continue b;
if(null===c.child||4===c.tag)continue b;else c.child.return=c,c=c.child}if(!(c.effectTag&2)){c=c.stateNode;break a}}d?Qi(a,c,b):Ri(a,c,b)}
function Qi(a,b,c){var d=a.tag,e=5===d||6===d;if(e)a=e?a.stateNode:a.stateNode.instance,b?8===c.nodeType?c.parentNode.insertBefore(a,b):c.insertBefore(a,b):(8===c.nodeType?(b=c.parentNode,b.insertBefore(a,c)):(b=c,b.appendChild(a)),c=c._reactRootContainer,null!==c&&void 0!==c||null!==b.onclick||(b.onclick=sd));else if(4!==d&&(a=a.child,null!==a))for(Qi(a,b,c),a=a.sibling;null!==a;)Qi(a,b,c),a=a.sibling}
function Ri(a,b,c){var d=a.tag,e=5===d||6===d;if(e)a=e?a.stateNode:a.stateNode.instance,b?c.insertBefore(a,b):c.appendChild(a);else if(4!==d&&(a=a.child,null!==a))for(Ri(a,b,c),a=a.sibling;null!==a;)Ri(a,b,c),a=a.sibling}
function Mi(a,b,c){for(var d=b,e=!1,f,g;;){if(!e){e=d.return;a:for(;;){if(null===e)throw Error(u(160));f=e.stateNode;switch(e.tag){case 5:g=!1;break a;case 3:f=f.containerInfo;g=!0;break a;case 4:f=f.containerInfo;g=!0;break a}e=e.return}e=!0}if(5===d.tag||6===d.tag){a:for(var h=a,k=d,l=c,m=k;;)if(Ki(h,m,l),null!==m.child&&4!==m.tag)m.child.return=m,m=m.child;else{if(m===k)break a;for(;null===m.sibling;){if(null===m.return||m.return===k)break a;m=m.return}m.sibling.return=m.return;m=m.sibling}g?(h=
f,k=d.stateNode,8===h.nodeType?h.parentNode.removeChild(k):h.removeChild(k)):f.removeChild(d.stateNode)}else if(4===d.tag){if(null!==d.child){f=d.stateNode.containerInfo;g=!0;d.child.return=d;d=d.child;continue}}else if(Ki(a,d,c),null!==d.child){d.child.return=d;d=d.child;continue}if(d===b)break;for(;null===d.sibling;){if(null===d.return||d.return===b)return;d=d.return;4===d.tag&&(e=!1)}d.sibling.return=d.return;d=d.sibling}}
function Si(a,b){switch(b.tag){case 0:case 11:case 14:case 15:case 22:Hi(3,b);return;case 1:return;case 5:var c=b.stateNode;if(null!=c){var d=b.memoizedProps,e=null!==a?a.memoizedProps:d;a=b.type;var f=b.updateQueue;b.updateQueue=null;if(null!==f){c[Nd]=d;"input"===a&&"radio"===d.type&&null!=d.name&&Bb(c,d);pd(a,e);b=pd(a,d);for(e=0;e<f.length;e+=2){var g=f[e],h=f[e+1];"style"===g?md(c,h):"dangerouslySetInnerHTML"===g?Qb(c,h):"children"===g?Rb(c,h):Xa(c,g,h,b)}switch(a){case "input":Cb(c,d);break;
case "textarea":Kb(c,d);break;case "select":b=c._wrapperState.wasMultiple,c._wrapperState.wasMultiple=!!d.multiple,a=d.value,null!=a?Hb(c,!!d.multiple,a,!1):b!==!!d.multiple&&(null!=d.defaultValue?Hb(c,!!d.multiple,d.defaultValue,!0):Hb(c,!!d.multiple,d.multiple?[]:"",!1))}}}return;case 6:if(null===b.stateNode)throw Error(u(162));b.stateNode.nodeValue=b.memoizedProps;return;case 3:b=b.stateNode;b.hydrate&&(b.hydrate=!1,Vc(b.containerInfo));return;case 12:return;case 13:c=b;null===b.memoizedState?
d=!1:(d=!0,c=b.child,Ti=$f());if(null!==c)a:for(a=c;;){if(5===a.tag)f=a.stateNode,d?(f=f.style,"function"===typeof f.setProperty?f.setProperty("display","none","important"):f.display="none"):(f=a.stateNode,e=a.memoizedProps.style,e=void 0!==e&&null!==e&&e.hasOwnProperty("display")?e.display:null,f.style.display=ld("display",e));else if(6===a.tag)a.stateNode.nodeValue=d?"":a.memoizedProps;else if(13===a.tag&&null!==a.memoizedState&&null===a.memoizedState.dehydrated){f=a.child.sibling;f.return=a;a=
f;continue}else if(null!==a.child){a.child.return=a;a=a.child;continue}if(a===c)break;for(;null===a.sibling;){if(null===a.return||a.return===c)break a;a=a.return}a.sibling.return=a.return;a=a.sibling}Ui(b);return;case 19:Ui(b);return;case 17:return}throw Error(u(163));}function Ui(a){var b=a.updateQueue;if(null!==b){a.updateQueue=null;var c=a.stateNode;null===c&&(c=a.stateNode=new Bi);b.forEach(function(b){var d=Vi.bind(null,a,b);c.has(b)||(c.add(b),b.then(d,d))})}}
var Wi="function"===typeof WeakMap?WeakMap:Map;function Xi(a,b,c){c=wg(c,null);c.tag=3;c.payload={element:null};var d=b.value;c.callback=function(){Yi||(Yi=!0,Zi=d);Ci(a,b)};return c}
function $i(a,b,c){c=wg(c,null);c.tag=3;var d=a.type.getDerivedStateFromError;if("function"===typeof d){var e=b.value;c.payload=function(){Ci(a,b);return d(e)}}var f=a.stateNode;null!==f&&"function"===typeof f.componentDidCatch&&(c.callback=function(){"function"!==typeof d&&(null===aj?aj=new Set([this]):aj.add(this),Ci(a,b));var c=b.stack;this.componentDidCatch(b.value,{componentStack:null!==c?c:""})});return c}
var bj=Math.ceil,cj=Wa.ReactCurrentDispatcher,dj=Wa.ReactCurrentOwner,V=0,ej=8,fj=16,gj=32,ti=0,hj=1,ij=2,ui=3,vi=4,jj=5,W=V,T=null,X=null,U=0,S=ti,kj=null,lj=1073741823,mj=1073741823,nj=null,wi=0,oj=!1,Ti=0,pj=500,Y=null,Yi=!1,Zi=null,aj=null,qj=!1,rj=null,sj=90,tj=null,uj=0,vj=null,wj=0;function Gg(){return(W&(fj|gj))!==V?1073741821-($f()/10|0):0!==wj?wj:wj=1073741821-($f()/10|0)}
function Hg(a,b,c){b=b.mode;if(0===(b&2))return 1073741823;var d=ag();if(0===(b&4))return 99===d?1073741823:1073741822;if((W&fj)!==V)return U;if(null!==c)a=hg(a,c.timeoutMs|0||5E3,250);else switch(d){case 99:a=1073741823;break;case 98:a=hg(a,150,100);break;case 97:case 96:a=hg(a,5E3,250);break;case 95:a=2;break;default:throw Error(u(326));}null!==T&&a===U&&--a;return a}
function Ig(a,b){if(50<uj)throw uj=0,vj=null,Error(u(185));a=xj(a,b);if(null!==a){var c=ag();1073741823===b?(W&ej)!==V&&(W&(fj|gj))===V?yj(a):(Z(a),W===V&&gg()):Z(a);(W&4)===V||98!==c&&99!==c||(null===tj?tj=new Map([[a,b]]):(c=tj.get(a),(void 0===c||c>b)&&tj.set(a,b)))}}
function xj(a,b){a.expirationTime<b&&(a.expirationTime=b);var c=a.alternate;null!==c&&c.expirationTime<b&&(c.expirationTime=b);var d=a.return,e=null;if(null===d&&3===a.tag)e=a.stateNode;else for(;null!==d;){c=d.alternate;d.childExpirationTime<b&&(d.childExpirationTime=b);null!==c&&c.childExpirationTime<b&&(c.childExpirationTime=b);if(null===d.return&&3===d.tag){e=d.stateNode;break}d=d.return}null!==e&&(T===e&&(Bg(b),S===vi&&xi(e,U)),yi(e,b));return e}
function zj(a){var b=a.lastExpiredTime;if(0!==b)return b;b=a.firstPendingTime;if(!Aj(a,b))return b;var c=a.lastPingedTime;a=a.nextKnownPendingLevel;a=c>a?c:a;return 2>=a&&b!==a?0:a}
function Z(a){if(0!==a.lastExpiredTime)a.callbackExpirationTime=1073741823,a.callbackPriority=99,a.callbackNode=eg(yj.bind(null,a));else{var b=zj(a),c=a.callbackNode;if(0===b)null!==c&&(a.callbackNode=null,a.callbackExpirationTime=0,a.callbackPriority=90);else{var d=Gg();1073741823===b?d=99:1===b||2===b?d=95:(d=10*(1073741821-b)-10*(1073741821-d),d=0>=d?99:250>=d?98:5250>=d?97:95);if(null!==c){var e=a.callbackPriority;if(a.callbackExpirationTime===b&&e>=d)return;c!==Tf&&Kf(c)}a.callbackExpirationTime=
b;a.callbackPriority=d;b=1073741823===b?eg(yj.bind(null,a)):dg(d,Bj.bind(null,a),{timeout:10*(1073741821-b)-$f()});a.callbackNode=b}}}
function Bj(a,b){wj=0;if(b)return b=Gg(),Cj(a,b),Z(a),null;var c=zj(a);if(0!==c){b=a.callbackNode;if((W&(fj|gj))!==V)throw Error(u(327));Dj();a===T&&c===U||Ej(a,c);if(null!==X){var d=W;W|=fj;var e=Fj();do try{Gj();break}catch(h){Hj(a,h)}while(1);ng();W=d;cj.current=e;if(S===hj)throw b=kj,Ej(a,c),xi(a,c),Z(a),b;if(null===X)switch(e=a.finishedWork=a.current.alternate,a.finishedExpirationTime=c,d=S,T=null,d){case ti:case hj:throw Error(u(345));case ij:Cj(a,2<c?2:c);break;case ui:xi(a,c);d=a.lastSuspendedTime;
c===d&&(a.nextKnownPendingLevel=Ij(e));if(1073741823===lj&&(e=Ti+pj-$f(),10<e)){if(oj){var f=a.lastPingedTime;if(0===f||f>=c){a.lastPingedTime=c;Ej(a,c);break}}f=zj(a);if(0!==f&&f!==c)break;if(0!==d&&d!==c){a.lastPingedTime=d;break}a.timeoutHandle=Hd(Jj.bind(null,a),e);break}Jj(a);break;case vi:xi(a,c);d=a.lastSuspendedTime;c===d&&(a.nextKnownPendingLevel=Ij(e));if(oj&&(e=a.lastPingedTime,0===e||e>=c)){a.lastPingedTime=c;Ej(a,c);break}e=zj(a);if(0!==e&&e!==c)break;if(0!==d&&d!==c){a.lastPingedTime=
d;break}1073741823!==mj?d=10*(1073741821-mj)-$f():1073741823===lj?d=0:(d=10*(1073741821-lj)-5E3,e=$f(),c=10*(1073741821-c)-e,d=e-d,0>d&&(d=0),d=(120>d?120:480>d?480:1080>d?1080:1920>d?1920:3E3>d?3E3:4320>d?4320:1960*bj(d/1960))-d,c<d&&(d=c));if(10<d){a.timeoutHandle=Hd(Jj.bind(null,a),d);break}Jj(a);break;case jj:if(1073741823!==lj&&null!==nj){f=lj;var g=nj;d=g.busyMinDurationMs|0;0>=d?d=0:(e=g.busyDelayMs|0,f=$f()-(10*(1073741821-f)-(g.timeoutMs|0||5E3)),d=f<=e?0:e+d-f);if(10<d){xi(a,c);a.timeoutHandle=
Hd(Jj.bind(null,a),d);break}}Jj(a);break;default:throw Error(u(329));}Z(a);if(a.callbackNode===b)return Bj.bind(null,a)}}return null}
function yj(a){var b=a.lastExpiredTime;b=0!==b?b:1073741823;if((W&(fj|gj))!==V)throw Error(u(327));Dj();a===T&&b===U||Ej(a,b);if(null!==X){var c=W;W|=fj;var d=Fj();do try{Kj();break}catch(e){Hj(a,e)}while(1);ng();W=c;cj.current=d;if(S===hj)throw c=kj,Ej(a,b),xi(a,b),Z(a),c;if(null!==X)throw Error(u(261));a.finishedWork=a.current.alternate;a.finishedExpirationTime=b;T=null;Jj(a);Z(a)}return null}function Lj(){if(null!==tj){var a=tj;tj=null;a.forEach(function(a,c){Cj(c,a);Z(c)});gg()}}
function Mj(a,b){var c=W;W|=1;try{return a(b)}finally{W=c,W===V&&gg()}}function Nj(a,b){var c=W;W&=-2;W|=ej;try{return a(b)}finally{W=c,W===V&&gg()}}
function Ej(a,b){a.finishedWork=null;a.finishedExpirationTime=0;var c=a.timeoutHandle;-1!==c&&(a.timeoutHandle=-1,Id(c));if(null!==X)for(c=X.return;null!==c;){var d=c;switch(d.tag){case 1:d=d.type.childContextTypes;null!==d&&void 0!==d&&Df();break;case 3:eh();H(K);H(J);break;case 5:gh(d);break;case 4:eh();break;case 13:H(M);break;case 19:H(M);break;case 10:og(d)}c=c.return}T=a;X=Sg(a.current,null);U=b;S=ti;kj=null;mj=lj=1073741823;nj=null;wi=0;oj=!1}
function Hj(a,b){do{try{ng();jh.current=sh;if(mh)for(var c=N.memoizedState;null!==c;){var d=c.queue;null!==d&&(d.pending=null);c=c.next}lh=0;P=O=N=null;mh=!1;if(null===X||null===X.return)return S=hj,kj=b,X=null;a:{var e=a,f=X.return,g=X,h=b;b=U;g.effectTag|=2048;g.firstEffect=g.lastEffect=null;if(null!==h&&"object"===typeof h&&"function"===typeof h.then){var k=h;if(0===(g.mode&2)){var l=g.alternate;l?(g.updateQueue=l.updateQueue,g.memoizedState=l.memoizedState,g.expirationTime=l.expirationTime):(g.updateQueue=
null,g.memoizedState=null)}var m=0!==(M.current&1),p=f;do{var x;if(x=13===p.tag){var z=p.memoizedState;if(null!==z)x=null!==z.dehydrated?!0:!1;else{var ca=p.memoizedProps;x=void 0===ca.fallback?!1:!0!==ca.unstable_avoidThisFallback?!0:m?!1:!0}}if(x){var D=p.updateQueue;if(null===D){var t=new Set;t.add(k);p.updateQueue=t}else D.add(k);if(0===(p.mode&2)){p.effectTag|=64;g.effectTag&=-2981;if(1===g.tag)if(null===g.alternate)g.tag=17;else{var y=wg(1073741823,null);y.tag=2;xg(g,y)}g.expirationTime=1073741823;
break a}h=void 0;g=b;var A=e.pingCache;null===A?(A=e.pingCache=new Wi,h=new Set,A.set(k,h)):(h=A.get(k),void 0===h&&(h=new Set,A.set(k,h)));if(!h.has(g)){h.add(g);var q=Oj.bind(null,e,k,g);k.then(q,q)}p.effectTag|=4096;p.expirationTime=b;break a}p=p.return}while(null!==p);h=Error((pb(g.type)||"A React component")+" suspended while rendering, but no fallback UI was specified.\n\nAdd a <Suspense fallback=...> component higher in the tree to provide a loading indicator or placeholder to display."+qb(g))}S!==
jj&&(S=ij);h=Ai(h,g);p=f;do{switch(p.tag){case 3:k=h;p.effectTag|=4096;p.expirationTime=b;var B=Xi(p,k,b);yg(p,B);break a;case 1:k=h;var w=p.type,ub=p.stateNode;if(0===(p.effectTag&64)&&("function"===typeof w.getDerivedStateFromError||null!==ub&&"function"===typeof ub.componentDidCatch&&(null===aj||!aj.has(ub)))){p.effectTag|=4096;p.expirationTime=b;var vb=$i(p,k,b);yg(p,vb);break a}}p=p.return}while(null!==p)}X=Pj(X)}catch(Xc){b=Xc;continue}break}while(1)}
function Fj(){var a=cj.current;cj.current=sh;return null===a?sh:a}function Ag(a,b){a<lj&&2<a&&(lj=a);null!==b&&a<mj&&2<a&&(mj=a,nj=b)}function Bg(a){a>wi&&(wi=a)}function Kj(){for(;null!==X;)X=Qj(X)}function Gj(){for(;null!==X&&!Uf();)X=Qj(X)}function Qj(a){var b=Rj(a.alternate,a,U);a.memoizedProps=a.pendingProps;null===b&&(b=Pj(a));dj.current=null;return b}
function Pj(a){X=a;do{var b=X.alternate;a=X.return;if(0===(X.effectTag&2048)){b=si(b,X,U);if(1===U||1!==X.childExpirationTime){for(var c=0,d=X.child;null!==d;){var e=d.expirationTime,f=d.childExpirationTime;e>c&&(c=e);f>c&&(c=f);d=d.sibling}X.childExpirationTime=c}if(null!==b)return b;null!==a&&0===(a.effectTag&2048)&&(null===a.firstEffect&&(a.firstEffect=X.firstEffect),null!==X.lastEffect&&(null!==a.lastEffect&&(a.lastEffect.nextEffect=X.firstEffect),a.lastEffect=X.lastEffect),1<X.effectTag&&(null!==
a.lastEffect?a.lastEffect.nextEffect=X:a.firstEffect=X,a.lastEffect=X))}else{b=zi(X);if(null!==b)return b.effectTag&=2047,b;null!==a&&(a.firstEffect=a.lastEffect=null,a.effectTag|=2048)}b=X.sibling;if(null!==b)return b;X=a}while(null!==X);S===ti&&(S=jj);return null}function Ij(a){var b=a.expirationTime;a=a.childExpirationTime;return b>a?b:a}function Jj(a){var b=ag();cg(99,Sj.bind(null,a,b));return null}
function Sj(a,b){do Dj();while(null!==rj);if((W&(fj|gj))!==V)throw Error(u(327));var c=a.finishedWork,d=a.finishedExpirationTime;if(null===c)return null;a.finishedWork=null;a.finishedExpirationTime=0;if(c===a.current)throw Error(u(177));a.callbackNode=null;a.callbackExpirationTime=0;a.callbackPriority=90;a.nextKnownPendingLevel=0;var e=Ij(c);a.firstPendingTime=e;d<=a.lastSuspendedTime?a.firstSuspendedTime=a.lastSuspendedTime=a.nextKnownPendingLevel=0:d<=a.firstSuspendedTime&&(a.firstSuspendedTime=
d-1);d<=a.lastPingedTime&&(a.lastPingedTime=0);d<=a.lastExpiredTime&&(a.lastExpiredTime=0);a===T&&(X=T=null,U=0);1<c.effectTag?null!==c.lastEffect?(c.lastEffect.nextEffect=c,e=c.firstEffect):e=c:e=c.firstEffect;if(null!==e){var f=W;W|=gj;dj.current=null;Dd=fd;var g=xd();if(yd(g)){if("selectionStart"in g)var h={start:g.selectionStart,end:g.selectionEnd};else a:{h=(h=g.ownerDocument)&&h.defaultView||window;var k=h.getSelection&&h.getSelection();if(k&&0!==k.rangeCount){h=k.anchorNode;var l=k.anchorOffset,
m=k.focusNode;k=k.focusOffset;try{h.nodeType,m.nodeType}catch(wb){h=null;break a}var p=0,x=-1,z=-1,ca=0,D=0,t=g,y=null;b:for(;;){for(var A;;){t!==h||0!==l&&3!==t.nodeType||(x=p+l);t!==m||0!==k&&3!==t.nodeType||(z=p+k);3===t.nodeType&&(p+=t.nodeValue.length);if(null===(A=t.firstChild))break;y=t;t=A}for(;;){if(t===g)break b;y===h&&++ca===l&&(x=p);y===m&&++D===k&&(z=p);if(null!==(A=t.nextSibling))break;t=y;y=t.parentNode}t=A}h=-1===x||-1===z?null:{start:x,end:z}}else h=null}h=h||{start:0,end:0}}else h=
null;Ed={activeElementDetached:null,focusedElem:g,selectionRange:h};fd=!1;Y=e;do try{Tj()}catch(wb){if(null===Y)throw Error(u(330));Ei(Y,wb);Y=Y.nextEffect}while(null!==Y);Y=e;do try{for(g=a,h=b;null!==Y;){var q=Y.effectTag;q&16&&Rb(Y.stateNode,"");if(q&128){var B=Y.alternate;if(null!==B){var w=B.ref;null!==w&&("function"===typeof w?w(null):w.current=null)}}switch(q&1038){case 2:Pi(Y);Y.effectTag&=-3;break;case 6:Pi(Y);Y.effectTag&=-3;Si(Y.alternate,Y);break;case 1024:Y.effectTag&=-1025;break;case 1028:Y.effectTag&=
-1025;Si(Y.alternate,Y);break;case 4:Si(Y.alternate,Y);break;case 8:l=Y,Mi(g,l,h),Ni(l)}Y=Y.nextEffect}}catch(wb){if(null===Y)throw Error(u(330));Ei(Y,wb);Y=Y.nextEffect}while(null!==Y);w=Ed;B=xd();q=w.focusedElem;h=w.selectionRange;if(B!==q&&q&&q.ownerDocument&&wd(q.ownerDocument.documentElement,q)){null!==h&&yd(q)&&(B=h.start,w=h.end,void 0===w&&(w=B),"selectionStart"in q?(q.selectionStart=B,q.selectionEnd=Math.min(w,q.value.length)):(w=(B=q.ownerDocument||document)&&B.defaultView||window,w.getSelection&&
(w=w.getSelection(),l=q.textContent.length,g=Math.min(h.start,l),h=void 0===h.end?g:Math.min(h.end,l),!w.extend&&g>h&&(l=h,h=g,g=l),l=vd(q,g),m=vd(q,h),l&&m&&(1!==w.rangeCount||w.anchorNode!==l.node||w.anchorOffset!==l.offset||w.focusNode!==m.node||w.focusOffset!==m.offset)&&(B=B.createRange(),B.setStart(l.node,l.offset),w.removeAllRanges(),g>h?(w.addRange(B),w.extend(m.node,m.offset)):(B.setEnd(m.node,m.offset),w.addRange(B))))));B=[];for(w=q;w=w.parentNode;)1===w.nodeType&&B.push({element:w,left:w.scrollLeft,
top:w.scrollTop});"function"===typeof q.focus&&q.focus();for(q=0;q<B.length;q++)w=B[q],w.element.scrollLeft=w.left,w.element.scrollTop=w.top}fd=!!Dd;Ed=Dd=null;a.current=c;Y=e;do try{for(q=a;null!==Y;){var ub=Y.effectTag;ub&36&&Ji(q,Y.alternate,Y);if(ub&128){B=void 0;var vb=Y.ref;if(null!==vb){var Xc=Y.stateNode;switch(Y.tag){case 5:B=Xc;break;default:B=Xc}"function"===typeof vb?vb(B):vb.current=B}}Y=Y.nextEffect}}catch(wb){if(null===Y)throw Error(u(330));Ei(Y,wb);Y=Y.nextEffect}while(null!==Y);Y=
null;Vf();W=f}else a.current=c;if(qj)qj=!1,rj=a,sj=b;else for(Y=e;null!==Y;)b=Y.nextEffect,Y.nextEffect=null,Y=b;b=a.firstPendingTime;0===b&&(aj=null);1073741823===b?a===vj?uj++:(uj=0,vj=a):uj=0;"function"===typeof Uj&&Uj(c.stateNode,d);Z(a);if(Yi)throw Yi=!1,a=Zi,Zi=null,a;if((W&ej)!==V)return null;gg();return null}function Tj(){for(;null!==Y;){var a=Y.effectTag;0!==(a&256)&&Gi(Y.alternate,Y);0===(a&512)||qj||(qj=!0,dg(97,function(){Dj();return null}));Y=Y.nextEffect}}
function Dj(){if(90!==sj){var a=97<sj?97:sj;sj=90;return cg(a,Vj)}}function Vj(){if(null===rj)return!1;var a=rj;rj=null;if((W&(fj|gj))!==V)throw Error(u(331));var b=W;W|=gj;for(a=a.current.firstEffect;null!==a;){try{var c=a;if(0!==(c.effectTag&512))switch(c.tag){case 0:case 11:case 15:case 22:Hi(5,c),Ii(5,c)}}catch(d){if(null===a)throw Error(u(330));Ei(a,d)}c=a.nextEffect;a.nextEffect=null;a=c}W=b;gg();return!0}
function Wj(a,b,c){b=Ai(c,b);b=Xi(a,b,1073741823);xg(a,b);a=xj(a,1073741823);null!==a&&Z(a)}function Ei(a,b){if(3===a.tag)Wj(a,a,b);else for(var c=a.return;null!==c;){if(3===c.tag){Wj(c,a,b);break}else if(1===c.tag){var d=c.stateNode;if("function"===typeof c.type.getDerivedStateFromError||"function"===typeof d.componentDidCatch&&(null===aj||!aj.has(d))){a=Ai(b,a);a=$i(c,a,1073741823);xg(c,a);c=xj(c,1073741823);null!==c&&Z(c);break}}c=c.return}}
function Oj(a,b,c){var d=a.pingCache;null!==d&&d.delete(b);T===a&&U===c?S===vi||S===ui&&1073741823===lj&&$f()-Ti<pj?Ej(a,U):oj=!0:Aj(a,c)&&(b=a.lastPingedTime,0!==b&&b<c||(a.lastPingedTime=c,Z(a)))}function Vi(a,b){var c=a.stateNode;null!==c&&c.delete(b);b=0;0===b&&(b=Gg(),b=Hg(b,a,null));a=xj(a,b);null!==a&&Z(a)}var Rj;
Rj=function(a,b,c){var d=b.expirationTime;if(null!==a){var e=b.pendingProps;if(a.memoizedProps!==e||K.current)rg=!0;else{if(d<c){rg=!1;switch(b.tag){case 3:hi(b);Xh();break;case 5:fh(b);if(b.mode&4&&1!==c&&e.hidden)return b.expirationTime=b.childExpirationTime=1,null;break;case 1:L(b.type)&&Gf(b);break;case 4:dh(b,b.stateNode.containerInfo);break;case 10:d=b.memoizedProps.value;e=b.type._context;I(jg,e._currentValue);e._currentValue=d;break;case 13:if(null!==b.memoizedState){d=b.child.childExpirationTime;
if(0!==d&&d>=c)return ji(a,b,c);I(M,M.current&1);b=$h(a,b,c);return null!==b?b.sibling:null}I(M,M.current&1);break;case 19:d=b.childExpirationTime>=c;if(0!==(a.effectTag&64)){if(d)return mi(a,b,c);b.effectTag|=64}e=b.memoizedState;null!==e&&(e.rendering=null,e.tail=null);I(M,M.current);if(!d)return null}return $h(a,b,c)}rg=!1}}else rg=!1;b.expirationTime=0;switch(b.tag){case 2:d=b.type;null!==a&&(a.alternate=null,b.alternate=null,b.effectTag|=2);a=b.pendingProps;e=Cf(b,J.current);qg(b,c);e=oh(null,
b,d,a,e,c);b.effectTag|=1;if("object"===typeof e&&null!==e&&"function"===typeof e.render&&void 0===e.$$typeof){b.tag=1;b.memoizedState=null;b.updateQueue=null;if(L(d)){var f=!0;Gf(b)}else f=!1;b.memoizedState=null!==e.state&&void 0!==e.state?e.state:null;ug(b);var g=d.getDerivedStateFromProps;"function"===typeof g&&Fg(b,d,g,a);e.updater=Jg;b.stateNode=e;e._reactInternalFiber=b;Ng(b,d,a,c);b=gi(null,b,d,!0,f,c)}else b.tag=0,R(null,b,e,c),b=b.child;return b;case 16:a:{e=b.elementType;null!==a&&(a.alternate=
null,b.alternate=null,b.effectTag|=2);a=b.pendingProps;ob(e);if(1!==e._status)throw e._result;e=e._result;b.type=e;f=b.tag=Xj(e);a=ig(e,a);switch(f){case 0:b=di(null,b,e,a,c);break a;case 1:b=fi(null,b,e,a,c);break a;case 11:b=Zh(null,b,e,a,c);break a;case 14:b=ai(null,b,e,ig(e.type,a),d,c);break a}throw Error(u(306,e,""));}return b;case 0:return d=b.type,e=b.pendingProps,e=b.elementType===d?e:ig(d,e),di(a,b,d,e,c);case 1:return d=b.type,e=b.pendingProps,e=b.elementType===d?e:ig(d,e),fi(a,b,d,e,c);
case 3:hi(b);d=b.updateQueue;if(null===a||null===d)throw Error(u(282));d=b.pendingProps;e=b.memoizedState;e=null!==e?e.element:null;vg(a,b);zg(b,d,null,c);d=b.memoizedState.element;if(d===e)Xh(),b=$h(a,b,c);else{if(e=b.stateNode.hydrate)Ph=Jd(b.stateNode.containerInfo.firstChild),Oh=b,e=Qh=!0;if(e)for(c=Yg(b,null,d,c),b.child=c;c;)c.effectTag=c.effectTag&-3|1024,c=c.sibling;else R(a,b,d,c),Xh();b=b.child}return b;case 5:return fh(b),null===a&&Uh(b),d=b.type,e=b.pendingProps,f=null!==a?a.memoizedProps:
null,g=e.children,Gd(d,e)?g=null:null!==f&&Gd(d,f)&&(b.effectTag|=16),ei(a,b),b.mode&4&&1!==c&&e.hidden?(b.expirationTime=b.childExpirationTime=1,b=null):(R(a,b,g,c),b=b.child),b;case 6:return null===a&&Uh(b),null;case 13:return ji(a,b,c);case 4:return dh(b,b.stateNode.containerInfo),d=b.pendingProps,null===a?b.child=Xg(b,null,d,c):R(a,b,d,c),b.child;case 11:return d=b.type,e=b.pendingProps,e=b.elementType===d?e:ig(d,e),Zh(a,b,d,e,c);case 7:return R(a,b,b.pendingProps,c),b.child;case 8:return R(a,
b,b.pendingProps.children,c),b.child;case 12:return R(a,b,b.pendingProps.children,c),b.child;case 10:a:{d=b.type._context;e=b.pendingProps;g=b.memoizedProps;f=e.value;var h=b.type._context;I(jg,h._currentValue);h._currentValue=f;if(null!==g)if(h=g.value,f=$e(h,f)?0:("function"===typeof d._calculateChangedBits?d._calculateChangedBits(h,f):1073741823)|0,0===f){if(g.children===e.children&&!K.current){b=$h(a,b,c);break a}}else for(h=b.child,null!==h&&(h.return=b);null!==h;){var k=h.dependencies;if(null!==
k){g=h.child;for(var l=k.firstContext;null!==l;){if(l.context===d&&0!==(l.observedBits&f)){1===h.tag&&(l=wg(c,null),l.tag=2,xg(h,l));h.expirationTime<c&&(h.expirationTime=c);l=h.alternate;null!==l&&l.expirationTime<c&&(l.expirationTime=c);pg(h.return,c);k.expirationTime<c&&(k.expirationTime=c);break}l=l.next}}else g=10===h.tag?h.type===b.type?null:h.child:h.child;if(null!==g)g.return=h;else for(g=h;null!==g;){if(g===b){g=null;break}h=g.sibling;if(null!==h){h.return=g.return;g=h;break}g=g.return}h=
g}R(a,b,e.children,c);b=b.child}return b;case 9:return e=b.type,f=b.pendingProps,d=f.children,qg(b,c),e=sg(e,f.unstable_observedBits),d=d(e),b.effectTag|=1,R(a,b,d,c),b.child;case 14:return e=b.type,f=ig(e,b.pendingProps),f=ig(e.type,f),ai(a,b,e,f,d,c);case 15:return ci(a,b,b.type,b.pendingProps,d,c);case 17:return d=b.type,e=b.pendingProps,e=b.elementType===d?e:ig(d,e),null!==a&&(a.alternate=null,b.alternate=null,b.effectTag|=2),b.tag=1,L(d)?(a=!0,Gf(b)):a=!1,qg(b,c),Lg(b,d,e),Ng(b,d,e,c),gi(null,
b,d,!0,a,c);case 19:return mi(a,b,c)}throw Error(u(156,b.tag));};var Uj=null,Li=null;function Yj(a){if("undefined"===typeof __REACT_DEVTOOLS_GLOBAL_HOOK__)return!1;var b=__REACT_DEVTOOLS_GLOBAL_HOOK__;if(b.isDisabled||!b.supportsFiber)return!0;try{var c=b.inject(a);Uj=function(a){try{b.onCommitFiberRoot(c,a,void 0,64===(a.current.effectTag&64))}catch(e){}};Li=function(a){try{b.onCommitFiberUnmount(c,a)}catch(e){}}}catch(d){}return!0}
function Zj(a,b,c,d){this.tag=a;this.key=c;this.sibling=this.child=this.return=this.stateNode=this.type=this.elementType=null;this.index=0;this.ref=null;this.pendingProps=b;this.dependencies=this.memoizedState=this.updateQueue=this.memoizedProps=null;this.mode=d;this.effectTag=0;this.lastEffect=this.firstEffect=this.nextEffect=null;this.childExpirationTime=this.expirationTime=0;this.alternate=null}function Sh(a,b,c,d){return new Zj(a,b,c,d)}
function bi(a){a=a.prototype;return!(!a||!a.isReactComponent)}function Xj(a){if("function"===typeof a)return bi(a)?1:0;if(void 0!==a&&null!==a){a=a.$$typeof;if(a===gb)return 11;if(a===jb)return 14}return 2}
function Sg(a,b){var c=a.alternate;null===c?(c=Sh(a.tag,b,a.key,a.mode),c.elementType=a.elementType,c.type=a.type,c.stateNode=a.stateNode,c.alternate=a,a.alternate=c):(c.pendingProps=b,c.effectTag=0,c.nextEffect=null,c.firstEffect=null,c.lastEffect=null);c.childExpirationTime=a.childExpirationTime;c.expirationTime=a.expirationTime;c.child=a.child;c.memoizedProps=a.memoizedProps;c.memoizedState=a.memoizedState;c.updateQueue=a.updateQueue;b=a.dependencies;c.dependencies=null===b?null:{expirationTime:b.expirationTime,
firstContext:b.firstContext,responders:b.responders};c.sibling=a.sibling;c.index=a.index;c.ref=a.ref;return c}
function Ug(a,b,c,d,e,f){var g=2;d=a;if("function"===typeof a)bi(a)&&(g=1);else if("string"===typeof a)g=5;else a:switch(a){case ab:return Wg(c.children,e,f,b);case fb:g=8;e|=7;break;case bb:g=8;e|=1;break;case cb:return a=Sh(12,c,b,e|8),a.elementType=cb,a.type=cb,a.expirationTime=f,a;case hb:return a=Sh(13,c,b,e),a.type=hb,a.elementType=hb,a.expirationTime=f,a;case ib:return a=Sh(19,c,b,e),a.elementType=ib,a.expirationTime=f,a;default:if("object"===typeof a&&null!==a)switch(a.$$typeof){case db:g=
10;break a;case eb:g=9;break a;case gb:g=11;break a;case jb:g=14;break a;case kb:g=16;d=null;break a;case lb:g=22;break a}throw Error(u(130,null==a?a:typeof a,""));}b=Sh(g,c,b,e);b.elementType=a;b.type=d;b.expirationTime=f;return b}function Wg(a,b,c,d){a=Sh(7,a,d,b);a.expirationTime=c;return a}function Tg(a,b,c){a=Sh(6,a,null,b);a.expirationTime=c;return a}
function Vg(a,b,c){b=Sh(4,null!==a.children?a.children:[],a.key,b);b.expirationTime=c;b.stateNode={containerInfo:a.containerInfo,pendingChildren:null,implementation:a.implementation};return b}
function ak(a,b,c){this.tag=b;this.current=null;this.containerInfo=a;this.pingCache=this.pendingChildren=null;this.finishedExpirationTime=0;this.finishedWork=null;this.timeoutHandle=-1;this.pendingContext=this.context=null;this.hydrate=c;this.callbackNode=null;this.callbackPriority=90;this.lastExpiredTime=this.lastPingedTime=this.nextKnownPendingLevel=this.lastSuspendedTime=this.firstSuspendedTime=this.firstPendingTime=0}
function Aj(a,b){var c=a.firstSuspendedTime;a=a.lastSuspendedTime;return 0!==c&&c>=b&&a<=b}function xi(a,b){var c=a.firstSuspendedTime,d=a.lastSuspendedTime;c<b&&(a.firstSuspendedTime=b);if(d>b||0===c)a.lastSuspendedTime=b;b<=a.lastPingedTime&&(a.lastPingedTime=0);b<=a.lastExpiredTime&&(a.lastExpiredTime=0)}
function yi(a,b){b>a.firstPendingTime&&(a.firstPendingTime=b);var c=a.firstSuspendedTime;0!==c&&(b>=c?a.firstSuspendedTime=a.lastSuspendedTime=a.nextKnownPendingLevel=0:b>=a.lastSuspendedTime&&(a.lastSuspendedTime=b+1),b>a.nextKnownPendingLevel&&(a.nextKnownPendingLevel=b))}function Cj(a,b){var c=a.lastExpiredTime;if(0===c||c>b)a.lastExpiredTime=b}
function bk(a,b,c,d){var e=b.current,f=Gg(),g=Dg.suspense;f=Hg(f,e,g);a:if(c){c=c._reactInternalFiber;b:{if(dc(c)!==c||1!==c.tag)throw Error(u(170));var h=c;do{switch(h.tag){case 3:h=h.stateNode.context;break b;case 1:if(L(h.type)){h=h.stateNode.__reactInternalMemoizedMergedChildContext;break b}}h=h.return}while(null!==h);throw Error(u(171));}if(1===c.tag){var k=c.type;if(L(k)){c=Ff(c,k,h);break a}}c=h}else c=Af;null===b.context?b.context=c:b.pendingContext=c;b=wg(f,g);b.payload={element:a};d=void 0===
d?null:d;null!==d&&(b.callback=d);xg(e,b);Ig(e,f);return f}function ck(a){a=a.current;if(!a.child)return null;switch(a.child.tag){case 5:return a.child.stateNode;default:return a.child.stateNode}}function dk(a,b){a=a.memoizedState;null!==a&&null!==a.dehydrated&&a.retryTime<b&&(a.retryTime=b)}function ek(a,b){dk(a,b);(a=a.alternate)&&dk(a,b)}
function fk(a,b,c){c=null!=c&&!0===c.hydrate;var d=new ak(a,b,c),e=Sh(3,null,null,2===b?7:1===b?3:0);d.current=e;e.stateNode=d;ug(e);a[Od]=d.current;c&&0!==b&&Jc(a,9===a.nodeType?a:a.ownerDocument);this._internalRoot=d}fk.prototype.render=function(a){bk(a,this._internalRoot,null,null)};fk.prototype.unmount=function(){var a=this._internalRoot,b=a.containerInfo;bk(null,a,null,function(){b[Od]=null})};
function gk(a){return!(!a||1!==a.nodeType&&9!==a.nodeType&&11!==a.nodeType&&(8!==a.nodeType||" react-mount-point-unstable "!==a.nodeValue))}function hk(a,b){b||(b=a?9===a.nodeType?a.documentElement:a.firstChild:null,b=!(!b||1!==b.nodeType||!b.hasAttribute("data-reactroot")));if(!b)for(var c;c=a.lastChild;)a.removeChild(c);return new fk(a,0,b?{hydrate:!0}:void 0)}
function ik(a,b,c,d,e){var f=c._reactRootContainer;if(f){var g=f._internalRoot;if("function"===typeof e){var h=e;e=function(){var a=ck(g);h.call(a)}}bk(b,g,a,e)}else{f=c._reactRootContainer=hk(c,d);g=f._internalRoot;if("function"===typeof e){var k=e;e=function(){var a=ck(g);k.call(a)}}Nj(function(){bk(b,g,a,e)})}return ck(g)}function jk(a,b,c){var d=3<arguments.length&&void 0!==arguments[3]?arguments[3]:null;return{$$typeof:$a,key:null==d?null:""+d,children:a,containerInfo:b,implementation:c}}
wc=function(a){if(13===a.tag){var b=hg(Gg(),150,100);Ig(a,b);ek(a,b)}};xc=function(a){13===a.tag&&(Ig(a,3),ek(a,3))};yc=function(a){if(13===a.tag){var b=Gg();b=Hg(b,a,null);Ig(a,b);ek(a,b)}};
za=function(a,b,c){switch(b){case "input":Cb(a,c);b=c.name;if("radio"===c.type&&null!=b){for(c=a;c.parentNode;)c=c.parentNode;c=c.querySelectorAll("input[name="+JSON.stringify(""+b)+'][type="radio"]');for(b=0;b<c.length;b++){var d=c[b];if(d!==a&&d.form===a.form){var e=Qd(d);if(!e)throw Error(u(90));yb(d);Cb(d,e)}}}break;case "textarea":Kb(a,c);break;case "select":b=c.value,null!=b&&Hb(a,!!c.multiple,b,!1)}};Fa=Mj;
Ga=function(a,b,c,d,e){var f=W;W|=4;try{return cg(98,a.bind(null,b,c,d,e))}finally{W=f,W===V&&gg()}};Ha=function(){(W&(1|fj|gj))===V&&(Lj(),Dj())};Ia=function(a,b){var c=W;W|=2;try{return a(b)}finally{W=c,W===V&&gg()}};function kk(a,b){var c=2<arguments.length&&void 0!==arguments[2]?arguments[2]:null;if(!gk(b))throw Error(u(200));return jk(a,b,null,c)}var lk={Events:[Nc,Pd,Qd,xa,ta,Xd,function(a){jc(a,Wd)},Da,Ea,id,mc,Dj,{current:!1}]};
(function(a){var b=a.findFiberByHostInstance;return Yj(n({},a,{overrideHookState:null,overrideProps:null,setSuspenseHandler:null,scheduleUpdate:null,currentDispatcherRef:Wa.ReactCurrentDispatcher,findHostInstanceByFiber:function(a){a=hc(a);return null===a?null:a.stateNode},findFiberByHostInstance:function(a){return b?b(a):null},findHostInstancesForRefresh:null,scheduleRefresh:null,scheduleRoot:null,setRefreshHandler:null,getCurrentFiber:null}))})({findFiberByHostInstance:tc,bundleType:0,version:"16.13.1",
rendererPackageName:"react-dom"});exports.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED=lk;exports.createPortal=kk;exports.findDOMNode=function(a){if(null==a)return null;if(1===a.nodeType)return a;var b=a._reactInternalFiber;if(void 0===b){if("function"===typeof a.render)throw Error(u(188));throw Error(u(268,Object.keys(a)));}a=hc(b);a=null===a?null:a.stateNode;return a};
exports.flushSync=function(a,b){if((W&(fj|gj))!==V)throw Error(u(187));var c=W;W|=1;try{return cg(99,a.bind(null,b))}finally{W=c,gg()}};exports.hydrate=function(a,b,c){if(!gk(b))throw Error(u(200));return ik(null,a,b,!0,c)};exports.render=function(a,b,c){if(!gk(b))throw Error(u(200));return ik(null,a,b,!1,c)};
exports.unmountComponentAtNode=function(a){if(!gk(a))throw Error(u(40));return a._reactRootContainer?(Nj(function(){ik(null,null,a,!1,function(){a._reactRootContainer=null;a[Od]=null})}),!0):!1};exports.unstable_batchedUpdates=Mj;exports.unstable_createPortal=function(a,b){return kk(a,b,2<arguments.length&&void 0!==arguments[2]?arguments[2]:null)};
exports.unstable_renderSubtreeIntoContainer=function(a,b,c,d){if(!gk(c))throw Error(u(200));if(null==a||void 0===a._reactInternalFiber)throw Error(u(38));return ik(a,b,c,!1,d)};exports.version="16.13.1";

},{"object-assign":13,"react":17,"scheduler":19}],15:[function(require,module,exports){
'use strict';

function checkDCE() {
  /* global __REACT_DEVTOOLS_GLOBAL_HOOK__ */
  if (
    typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ === 'undefined' ||
    typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE !== 'function'
  ) {
    return;
  }
  if ("production" !== 'production') {
    // This branch is unreachable because this function is only called
    // in production, but the condition is true only in development.
    // Therefore if the branch is still here, dead code elimination wasn't
    // properly applied.
    // Don't change the message. React DevTools relies on it. Also make sure
    // this message doesn't occur elsewhere in this function, or it will cause
    // a false positive.
    throw new Error('^_^');
  }
  try {
    // Verify that the code above has been dead code eliminated (DCE'd).
    __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(checkDCE);
  } catch (err) {
    // DevTools shouldn't crash React, no matter what.
    // We should still report in case we break this code.
    console.error(err);
  }
}

if ("production" === 'production') {
  // DCE check should happen before ReactDOM bundle executes so that
  // DevTools can report bad minification during injection.
  checkDCE();
  module.exports = require('./cjs/react-dom.production.min.js');
} else {
  module.exports = null;
}

},{"./cjs/react-dom.production.min.js":14}],16:[function(require,module,exports){
/** @license React v16.13.1
 * react.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';var l=require("object-assign"),n="function"===typeof Symbol&&Symbol.for,p=n?Symbol.for("react.element"):60103,q=n?Symbol.for("react.portal"):60106,r=n?Symbol.for("react.fragment"):60107,t=n?Symbol.for("react.strict_mode"):60108,u=n?Symbol.for("react.profiler"):60114,v=n?Symbol.for("react.provider"):60109,w=n?Symbol.for("react.context"):60110,x=n?Symbol.for("react.forward_ref"):60112,y=n?Symbol.for("react.suspense"):60113,z=n?Symbol.for("react.memo"):60115,A=n?Symbol.for("react.lazy"):
60116,B="function"===typeof Symbol&&Symbol.iterator;function C(a){for(var b="https://reactjs.org/docs/error-decoder.html?invariant="+a,c=1;c<arguments.length;c++)b+="&args[]="+encodeURIComponent(arguments[c]);return"Minified React error #"+a+"; visit "+b+" for the full message or use the non-minified dev environment for full errors and additional helpful warnings."}
var D={isMounted:function(){return!1},enqueueForceUpdate:function(){},enqueueReplaceState:function(){},enqueueSetState:function(){}},E={};function F(a,b,c){this.props=a;this.context=b;this.refs=E;this.updater=c||D}F.prototype.isReactComponent={};F.prototype.setState=function(a,b){if("object"!==typeof a&&"function"!==typeof a&&null!=a)throw Error(C(85));this.updater.enqueueSetState(this,a,b,"setState")};F.prototype.forceUpdate=function(a){this.updater.enqueueForceUpdate(this,a,"forceUpdate")};
function G(){}G.prototype=F.prototype;function H(a,b,c){this.props=a;this.context=b;this.refs=E;this.updater=c||D}var I=H.prototype=new G;I.constructor=H;l(I,F.prototype);I.isPureReactComponent=!0;var J={current:null},K=Object.prototype.hasOwnProperty,L={key:!0,ref:!0,__self:!0,__source:!0};
function M(a,b,c){var e,d={},g=null,k=null;if(null!=b)for(e in void 0!==b.ref&&(k=b.ref),void 0!==b.key&&(g=""+b.key),b)K.call(b,e)&&!L.hasOwnProperty(e)&&(d[e]=b[e]);var f=arguments.length-2;if(1===f)d.children=c;else if(1<f){for(var h=Array(f),m=0;m<f;m++)h[m]=arguments[m+2];d.children=h}if(a&&a.defaultProps)for(e in f=a.defaultProps,f)void 0===d[e]&&(d[e]=f[e]);return{$$typeof:p,type:a,key:g,ref:k,props:d,_owner:J.current}}
function N(a,b){return{$$typeof:p,type:a.type,key:b,ref:a.ref,props:a.props,_owner:a._owner}}function O(a){return"object"===typeof a&&null!==a&&a.$$typeof===p}function escape(a){var b={"=":"=0",":":"=2"};return"$"+(""+a).replace(/[=:]/g,function(a){return b[a]})}var P=/\/+/g,Q=[];function R(a,b,c,e){if(Q.length){var d=Q.pop();d.result=a;d.keyPrefix=b;d.func=c;d.context=e;d.count=0;return d}return{result:a,keyPrefix:b,func:c,context:e,count:0}}
function S(a){a.result=null;a.keyPrefix=null;a.func=null;a.context=null;a.count=0;10>Q.length&&Q.push(a)}
function T(a,b,c,e){var d=typeof a;if("undefined"===d||"boolean"===d)a=null;var g=!1;if(null===a)g=!0;else switch(d){case "string":case "number":g=!0;break;case "object":switch(a.$$typeof){case p:case q:g=!0}}if(g)return c(e,a,""===b?"."+U(a,0):b),1;g=0;b=""===b?".":b+":";if(Array.isArray(a))for(var k=0;k<a.length;k++){d=a[k];var f=b+U(d,k);g+=T(d,f,c,e)}else if(null===a||"object"!==typeof a?f=null:(f=B&&a[B]||a["@@iterator"],f="function"===typeof f?f:null),"function"===typeof f)for(a=f.call(a),k=
0;!(d=a.next()).done;)d=d.value,f=b+U(d,k++),g+=T(d,f,c,e);else if("object"===d)throw c=""+a,Error(C(31,"[object Object]"===c?"object with keys {"+Object.keys(a).join(", ")+"}":c,""));return g}function V(a,b,c){return null==a?0:T(a,"",b,c)}function U(a,b){return"object"===typeof a&&null!==a&&null!=a.key?escape(a.key):b.toString(36)}function W(a,b){a.func.call(a.context,b,a.count++)}
function aa(a,b,c){var e=a.result,d=a.keyPrefix;a=a.func.call(a.context,b,a.count++);Array.isArray(a)?X(a,e,c,function(a){return a}):null!=a&&(O(a)&&(a=N(a,d+(!a.key||b&&b.key===a.key?"":(""+a.key).replace(P,"$&/")+"/")+c)),e.push(a))}function X(a,b,c,e,d){var g="";null!=c&&(g=(""+c).replace(P,"$&/")+"/");b=R(b,g,e,d);V(a,aa,b);S(b)}var Y={current:null};function Z(){var a=Y.current;if(null===a)throw Error(C(321));return a}
var ba={ReactCurrentDispatcher:Y,ReactCurrentBatchConfig:{suspense:null},ReactCurrentOwner:J,IsSomeRendererActing:{current:!1},assign:l};exports.Children={map:function(a,b,c){if(null==a)return a;var e=[];X(a,e,null,b,c);return e},forEach:function(a,b,c){if(null==a)return a;b=R(null,null,b,c);V(a,W,b);S(b)},count:function(a){return V(a,function(){return null},null)},toArray:function(a){var b=[];X(a,b,null,function(a){return a});return b},only:function(a){if(!O(a))throw Error(C(143));return a}};
exports.Component=F;exports.Fragment=r;exports.Profiler=u;exports.PureComponent=H;exports.StrictMode=t;exports.Suspense=y;exports.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED=ba;
exports.cloneElement=function(a,b,c){if(null===a||void 0===a)throw Error(C(267,a));var e=l({},a.props),d=a.key,g=a.ref,k=a._owner;if(null!=b){void 0!==b.ref&&(g=b.ref,k=J.current);void 0!==b.key&&(d=""+b.key);if(a.type&&a.type.defaultProps)var f=a.type.defaultProps;for(h in b)K.call(b,h)&&!L.hasOwnProperty(h)&&(e[h]=void 0===b[h]&&void 0!==f?f[h]:b[h])}var h=arguments.length-2;if(1===h)e.children=c;else if(1<h){f=Array(h);for(var m=0;m<h;m++)f[m]=arguments[m+2];e.children=f}return{$$typeof:p,type:a.type,
key:d,ref:g,props:e,_owner:k}};exports.createContext=function(a,b){void 0===b&&(b=null);a={$$typeof:w,_calculateChangedBits:b,_currentValue:a,_currentValue2:a,_threadCount:0,Provider:null,Consumer:null};a.Provider={$$typeof:v,_context:a};return a.Consumer=a};exports.createElement=M;exports.createFactory=function(a){var b=M.bind(null,a);b.type=a;return b};exports.createRef=function(){return{current:null}};exports.forwardRef=function(a){return{$$typeof:x,render:a}};exports.isValidElement=O;
exports.lazy=function(a){return{$$typeof:A,_ctor:a,_status:-1,_result:null}};exports.memo=function(a,b){return{$$typeof:z,type:a,compare:void 0===b?null:b}};exports.useCallback=function(a,b){return Z().useCallback(a,b)};exports.useContext=function(a,b){return Z().useContext(a,b)};exports.useDebugValue=function(){};exports.useEffect=function(a,b){return Z().useEffect(a,b)};exports.useImperativeHandle=function(a,b,c){return Z().useImperativeHandle(a,b,c)};
exports.useLayoutEffect=function(a,b){return Z().useLayoutEffect(a,b)};exports.useMemo=function(a,b){return Z().useMemo(a,b)};exports.useReducer=function(a,b,c){return Z().useReducer(a,b,c)};exports.useRef=function(a){return Z().useRef(a)};exports.useState=function(a){return Z().useState(a)};exports.version="16.13.1";

},{"object-assign":13}],17:[function(require,module,exports){
'use strict';

if ("production" === 'production') {
  module.exports = require('./cjs/react.production.min.js');
} else {
  module.exports = null;
}

},{"./cjs/react.production.min.js":16}],18:[function(require,module,exports){
/** @license React v0.19.1
 * scheduler.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';var f,g,h,k,l;
if("undefined"===typeof window||"function"!==typeof MessageChannel){var p=null,q=null,t=function(){if(null!==p)try{var a=exports.unstable_now();p(!0,a);p=null}catch(b){throw setTimeout(t,0),b;}},u=Date.now();exports.unstable_now=function(){return Date.now()-u};f=function(a){null!==p?setTimeout(f,0,a):(p=a,setTimeout(t,0))};g=function(a,b){q=setTimeout(a,b)};h=function(){clearTimeout(q)};k=function(){return!1};l=exports.unstable_forceFrameRate=function(){}}else{var w=window.performance,x=window.Date,
y=window.setTimeout,z=window.clearTimeout;if("undefined"!==typeof console){var A=window.cancelAnimationFrame;"function"!==typeof window.requestAnimationFrame&&console.error("This browser doesn't support requestAnimationFrame. Make sure that you load a polyfill in older browsers. https://fb.me/react-polyfills");"function"!==typeof A&&console.error("This browser doesn't support cancelAnimationFrame. Make sure that you load a polyfill in older browsers. https://fb.me/react-polyfills")}if("object"===
typeof w&&"function"===typeof w.now)exports.unstable_now=function(){return w.now()};else{var B=x.now();exports.unstable_now=function(){return x.now()-B}}var C=!1,D=null,E=-1,F=5,G=0;k=function(){return exports.unstable_now()>=G};l=function(){};exports.unstable_forceFrameRate=function(a){0>a||125<a?console.error("forceFrameRate takes a positive int between 0 and 125, forcing framerates higher than 125 fps is not unsupported"):F=0<a?Math.floor(1E3/a):5};var H=new MessageChannel,I=H.port2;H.port1.onmessage=
function(){if(null!==D){var a=exports.unstable_now();G=a+F;try{D(!0,a)?I.postMessage(null):(C=!1,D=null)}catch(b){throw I.postMessage(null),b;}}else C=!1};f=function(a){D=a;C||(C=!0,I.postMessage(null))};g=function(a,b){E=y(function(){a(exports.unstable_now())},b)};h=function(){z(E);E=-1}}function J(a,b){var c=a.length;a.push(b);a:for(;;){var d=c-1>>>1,e=a[d];if(void 0!==e&&0<K(e,b))a[d]=b,a[c]=e,c=d;else break a}}function L(a){a=a[0];return void 0===a?null:a}
function M(a){var b=a[0];if(void 0!==b){var c=a.pop();if(c!==b){a[0]=c;a:for(var d=0,e=a.length;d<e;){var m=2*(d+1)-1,n=a[m],v=m+1,r=a[v];if(void 0!==n&&0>K(n,c))void 0!==r&&0>K(r,n)?(a[d]=r,a[v]=c,d=v):(a[d]=n,a[m]=c,d=m);else if(void 0!==r&&0>K(r,c))a[d]=r,a[v]=c,d=v;else break a}}return b}return null}function K(a,b){var c=a.sortIndex-b.sortIndex;return 0!==c?c:a.id-b.id}var N=[],O=[],P=1,Q=null,R=3,S=!1,T=!1,U=!1;
function V(a){for(var b=L(O);null!==b;){if(null===b.callback)M(O);else if(b.startTime<=a)M(O),b.sortIndex=b.expirationTime,J(N,b);else break;b=L(O)}}function W(a){U=!1;V(a);if(!T)if(null!==L(N))T=!0,f(X);else{var b=L(O);null!==b&&g(W,b.startTime-a)}}
function X(a,b){T=!1;U&&(U=!1,h());S=!0;var c=R;try{V(b);for(Q=L(N);null!==Q&&(!(Q.expirationTime>b)||a&&!k());){var d=Q.callback;if(null!==d){Q.callback=null;R=Q.priorityLevel;var e=d(Q.expirationTime<=b);b=exports.unstable_now();"function"===typeof e?Q.callback=e:Q===L(N)&&M(N);V(b)}else M(N);Q=L(N)}if(null!==Q)var m=!0;else{var n=L(O);null!==n&&g(W,n.startTime-b);m=!1}return m}finally{Q=null,R=c,S=!1}}
function Y(a){switch(a){case 1:return-1;case 2:return 250;case 5:return 1073741823;case 4:return 1E4;default:return 5E3}}var Z=l;exports.unstable_IdlePriority=5;exports.unstable_ImmediatePriority=1;exports.unstable_LowPriority=4;exports.unstable_NormalPriority=3;exports.unstable_Profiling=null;exports.unstable_UserBlockingPriority=2;exports.unstable_cancelCallback=function(a){a.callback=null};exports.unstable_continueExecution=function(){T||S||(T=!0,f(X))};
exports.unstable_getCurrentPriorityLevel=function(){return R};exports.unstable_getFirstCallbackNode=function(){return L(N)};exports.unstable_next=function(a){switch(R){case 1:case 2:case 3:var b=3;break;default:b=R}var c=R;R=b;try{return a()}finally{R=c}};exports.unstable_pauseExecution=function(){};exports.unstable_requestPaint=Z;exports.unstable_runWithPriority=function(a,b){switch(a){case 1:case 2:case 3:case 4:case 5:break;default:a=3}var c=R;R=a;try{return b()}finally{R=c}};
exports.unstable_scheduleCallback=function(a,b,c){var d=exports.unstable_now();if("object"===typeof c&&null!==c){var e=c.delay;e="number"===typeof e&&0<e?d+e:d;c="number"===typeof c.timeout?c.timeout:Y(a)}else c=Y(a),e=d;c=e+c;a={id:P++,callback:b,priorityLevel:a,startTime:e,expirationTime:c,sortIndex:-1};e>d?(a.sortIndex=e,J(O,a),null===L(N)&&a===L(O)&&(U?h():U=!0,g(W,e-d))):(a.sortIndex=c,J(N,a),T||S||(T=!0,f(X)));return a};
exports.unstable_shouldYield=function(){var a=exports.unstable_now();V(a);var b=L(N);return b!==Q&&null!==Q&&null!==b&&null!==b.callback&&b.startTime<=a&&b.expirationTime<Q.expirationTime||k()};exports.unstable_wrapCallback=function(a){var b=R;return function(){var c=R;R=b;try{return a.apply(this,arguments)}finally{R=c}}};

},{}],19:[function(require,module,exports){
'use strict';

if ("production" === 'production') {
  module.exports = require('./cjs/scheduler.production.min.js');
} else {
  module.exports = null;
}

},{"./cjs/scheduler.production.min.js":18}],20:[function(require,module,exports){
"use strict";

// live-backend.js - the Portfolio web app's shell: answers the widget's
// commands with the widget's own Python running in worker.js.
//
// The widget asks for its main command every 5 s. widget_command.sh on the
// Mac answers at once from the cache and starts a refresh in the background;
// here the worker is that background (one job at a time), so while it is busy
// the answer comes from what this page already has, with the job's progress.
const CACHE_KEY = "pw-live-data-v1"; // the last data.json, for an instant first paint

module.exports = function liveBackend(opts) {
  const worker = new Worker(opts.worker || "worker.js");
  let seq = 0;
  const waiting = new Map();
  let chain = Promise.resolve();
  const st = {
    booted: false,
    bootError: null,
    fetch: false,
    hist: false,
    progress: null,
    histProgress: null,
    env: null,
    data: null,
    dataAt: 0
  };

  try {
    st.data = localStorage.getItem(CACHE_KEY) || null;
  } catch (e) {
    st.data = null;
  }

  worker.onmessage = e => {
    const m = e.data;

    if (typeof m === "string") {
      try {
        const p = JSON.parse(m);
        if (p.progress === "fetch") st.progress = p.value;else if (p.progress === "history") st.histProgress = p.value;
      } catch (err) {
        /* ignore */
      }

      return;
    }

    const w = waiting.get(m.id);
    if (!w) return;
    waiting.delete(m.id);
    if (m.download) saveFile(m.download.name, m.download.bytes);
    if (m.ok) w.res(m.result);else w.rej(new Error(m.error));
  }; // the worker script itself failed (missing, blocked, or crashed): every
  // waiting call fails, so the page can fall back to the recorded demo


  const fail = why => {
    st.bootError = st.bootError || why;
    waiting.forEach(w => w.rej(new Error(st.bootError)));
    waiting.clear();
  };

  worker.onerror = e => fail(e && e.message || "the engine failed to start");

  const send = (msg, transfer) => new Promise((res, rej) => {
    const id = ++seq;
    waiting.set(id, {
      res,
      rej
    });
    worker.postMessage(Object.assign({
      id
    }, msg), transfer || []);
  }); // jobs run one after another, like the shell's single background fetch


  const queue = (msg, transfer) => {
    const p = chain.then(() => send(msg, transfer));
    chain = p.then(() => null, () => null);
    return p;
  };

  const locale = (navigator.language || "en-US").replace("-", "_");
  const BOOT_LIMIT_MS = 90000; // a slow first download of Python is fine; a stuck one isn't

  const boot = queue({
    op: "boot",
    bundle: opts.bundle || "py-bundle.json",
    locale,
    api: opts.api || ""
  });
  const limit = new Promise((res, rej) => setTimeout(() => {
    if (!st.booted) {
      fail("the engine took too long to start");
      rej(new Error(st.bootError));
    }
  }, BOOT_LIMIT_MS));
  const ready = Promise.race([boot, limit]).then(r => {
    st.booted = true;
    return r;
  }, e => {
    st.bootError = String(e.message || e);
    throw e;
  });

  const keep = text => {
    st.data = text;

    try {
      if (text && text.length < 2500000) localStorage.setItem(CACHE_KEY, text);
    } catch (e) {
      /* full or private: fine */
    }
  }; // the envelope the widget reads (built as text: data.json can be large)


  const envelope = (env, data) => {
    const head = JSON.stringify(env);
    return head.slice(0, -1) + ',"data":' + (opts.patchData ? opts.patchData(data) : data || "null") + "}";
  };

  const busyEnvelope = why => envelope({
    status: st.data || st.fetch ? "loading" : "loading",
    cacheAgeSeconds: st.env ? st.env.cacheAgeSeconds : 0,
    lastFetchFailed: false,
    progress: st.fetch ? st.progress || {
      done: 0,
      total: 0,
      current: why || "prices"
    } : st.booted ? null : {
      done: 0,
      total: 0,
      current: "starting"
    },
    historyProgress: st.hist ? st.histProgress : null,
    updateResult: null,
    errorText: null
  }, st.data);

  const changed = () => {
    if (opts.onChange) setTimeout(opts.onChange, 0);
  };

  ready.then(changed, changed);

  const startFetch = () => {
    st.fetch = true;
    st.progress = null;
    queue({
      op: "refresh"
    }).catch(() => null).then(() => {
      st.fetch = false;
      st.progress = null;
      changed();
    });
  };

  const startHistory = () => {
    st.hist = true;
    st.histProgress = null;
    queue({
      op: "history"
    }).catch(() => null).then(() => {
      st.hist = false;
      st.histProgress = null;
      changed();
    });
  };

  let ticking = false;

  const main = () => {
    if (st.bootError) return Promise.reject(new Error(st.bootError));
    if (!st.booted || st.fetch || st.hist || ticking) return Promise.resolve(busyEnvelope());
    ticking = true;
    return queue({
      op: "tick",
      fetch: st.fetch,
      hist: st.hist
    }).then(txt => {
      ticking = false;
      const r = JSON.parse(txt);
      if (r.data) keep(r.data);
      st.env = r.envelope;
      if (r.startFetch) startFetch();else if (r.startHistory) startHistory();
      if (st.fetch) r.envelope.status = "loading";
      if (st.hist) r.envelope.historyProgress = st.histProgress || {
        done: 0,
        total: 0,
        current: "starting"
      };
      return envelope(r.envelope, r.data || st.data);
    }, e => {
      ticking = false;
      throw e;
    });
  };

  const helper = args => {
    if (args[0] === "import" && args[1] === "choose") return pickFile();
    return queue({
      op: "helper",
      args
    });
  }; // "import choose": the browser's file picker instead of the Mac's


  const pickFile = () => new Promise(res => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values";
    let done = false;

    const finish = v => {
      if (!done) {
        done = true;
        res(JSON.stringify(v));
      }
    };

    input.addEventListener("cancel", () => finish({
      cancelled: true
    }));
    input.addEventListener("change", () => {
      const f = input.files && input.files[0];
      if (!f) return finish({
        cancelled: true
      });
      f.arrayBuffer().then(buf => {
        const name = "/tmp/import/" + (f.name || "list.csv").replace(/[^\w.\- ]+/g, "_").slice(0, 80);
        return queue({
          op: "file",
          path: name,
          bytes: buf
        }, [buf]).then(() => finish({
          file: name
        }));
      }).catch(() => finish({
        cancelled: true
      }));
    });
    input.click();
  });

  const saveFile = (name, bytes) => {
    try {
      const url = URL.createObjectURL(new Blob([bytes], {
        type: "application/zip"
      }));
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      st.lastDownload = {
        name: name,
        size: bytes.byteLength || bytes.length || 0
      };
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      /* the reply still says what was exported */
    }
  };

  window.PW_DEBUG = () => queue({
    op: "debug"
  }).then(t => Object.assign(JSON.parse(t), {
    page: {
      booted: st.booted,
      fetch: st.fetch,
      hist: st.hist,
      lastDownload: st.lastDownload || null
    }
  }));

  return {
    kind: "live",
    ready,
    main,
    helper,
    state: st,
    forget: () => {
      try {
        localStorage.removeItem(CACHE_KEY);
      } catch (e) {
        /* ok */
      }
    }
  };
};

},{}],21:[function(require,module,exports){
"use strict";

// web-entry.js - start the widget: live (the widget's Python in a worker,
// live prices) or, if that can't start, the recorded demo. ?demo forces the
// recorded demo.
const rt = require("./web-runtime.js");

const liveBackend = require("./live-backend.js");

const widget = require("pw-widget");

const mount = document.getElementById("pw-root");

const emit = detail => document.dispatchEvent(new CustomEvent("pw-ready", {
  detail
}));

const loadRec = () => fetch("data/recording.json", {
  cache: "no-cache"
}).then(r => {
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
});

const crash = msg => {
  mount.innerHTML = "";
  const p = document.createElement("p");
  p.className = "pw-crash";
  p.textContent = msg;
  mount.appendChild(p);
}; // the price feed: this site's /api/yf, or another site's (the GitHub Pages copy
// uses the Game Lobby's), named by <meta name="pw-api" content="...">


const apiMeta = document.querySelector('meta[name="pw-api"]');
const API = new URL(apiMeta && apiMeta.content || "/api/yf", location.href).href;
const wantDemo = /[?&]demo\b/.test(location.search) || typeof Worker === "undefined" || typeof WebAssembly === "undefined";

if (wantDemo) {
  loadRec().then(rec => {
    const rb = rt.replayBackend(rec);
    window.PW_WEB = {
      reset: () => {
        rb.forget();
        location.reload();
      }
    };
    rt.start(widget, rb, mount);
    emit({
      mode: "replay",
      recordedAt: rec.recordedAt,
      data: rec.main.data
    });
  }).catch(e => crash("Couldn't load the demo data (" + e.message + "). Try reloading the page."));
} else {
  const be = liveBackend({
    worker: "worker.js",
    bundle: "py-bundle.json",
    api: API,
    patchData: rt.patchDataText,
    onChange: rt.kick
  });
  rt.start(widget, be, mount);
  emit({
    mode: "live"
  });
  be.ready.then(() => emit({
    mode: "live",
    booted: true
  }), e => {
    console.warn("live engine failed, showing the recorded demo:", e);
    loadRec().then(rec => {
      const rb = rt.replayBackend(rec);
      window.PW_WEB = {
        reset: () => {
          rb.forget();
          location.reload();
        }
      };
      rt.setBackend(rb);
      rt.kick();
      emit({
        mode: "replay",
        fallback: true,
        recordedAt: rec.recordedAt,
        data: rec.main.data
      });
    }).catch(() => crash("The app couldn't start (" + String(e.message || e) + "). Try reloading the page."));
  });
}

},{"./live-backend.js":20,"./web-runtime.js":22,"pw-widget":"pw-widget"}],22:[function(require,module,exports){
"use strict";

// web-runtime.js - runs Portfolio.widget's own index.jsx in a plain browser.
//
// Übersicht normally does two jobs for the widget: it runs the widget's
// lifecycle (command every refreshFrequency -> updateState -> render), and it
// runs shell commands for it. Here the lifecycle is re-created in a few lines,
// and the shell is a "backend":
//   * live   (tools/live-backend.js): the widget's own Python in a Web Worker,
//            with live prices - the web app
//   * replay (below): a recording of the widget on the demo portfolio
//            (data/recording.json), used if the live engine can't start
const React = require("react");

const ReactDom = require("react-dom");

const {
  css
} = require("emotion");

window.html = React.createElement; // the JSX pragma Übersicht compiles with

let backend = null; // ---- shell words: the widget quotes every argument with shq ('...' and '\'')

const shellWords = s => {
  const out = [];
  let cur = null,
      i = 0;

  while (i < s.length) {
    const c = s[i];

    if (c === "'") {
      const j = s.indexOf("'", i + 1);
      cur = (cur || "") + s.slice(i + 1, j < 0 ? s.length : j);
      i = j < 0 ? s.length : j + 1;
    } else if (c === "\\" && i + 1 < s.length) {
      cur = (cur || "") + s[i + 1];
      i += 2;
    } else if (/\s/.test(c)) {
      if (cur !== null) {
        out.push(cur);
        cur = null;
      }

      i++;
    } else {
      cur = (cur || "") + c;
      i++;
    }
  }

  if (cur !== null) out.push(cur);
  return out;
}; // a phone: the window gets the screen's width, so the widget's own layout
// engine folds to one column (a 664 px window would just be squeezed)


const narrowUi = ui => {
  const vw = window.innerWidth;
  if (vw < 680 && ui && !ui.display) return Object.assign({}, ui, {
    display: {
      windows: [{
        id: "main",
        w: Math.max(300, vw - 16)
      }]
    }
  });
  return ui;
};

const patchDataText = text => {
  if (!text || window.innerWidth >= 680) return text || "null";

  try {
    const d = JSON.parse(text);

    if (d && d.ui && !d.ui.display) {
      d.ui = narrowUi(d.ui);
      return JSON.stringify(d);
    }
  } catch (e) {
    /* as it is */
  }

  return text;
};

const DEMO_NOTE = "not in the web demo — get the widget for your Mac to do this"; // ---- the replay backend: the recording, with look settings kept in this browser

function replayBackend(REC) {
  const STORE_KEY = "pw-web-demo-v1";
  const LABELS = {
    showBenchmark: "the index line",
    graphBig: "the bigger graph",
    compact: "the one-line view",
    position: "where the widget sits",
    scale: "the widget's size",
    display: "what a window shows",
    title: "the portfolio name",
    theme: "the look",
    opacity: "the background",
    updates: "the update check",
    welcome: "the welcome card",
    rebalanceWhole: "how rebalancing rounds"
  };
  const LOCAL_KEYS = Object.keys(LABELS);
  const RESET_ALL = {
    display: null,
    position: null,
    scale: 1,
    graphBig: false,
    showBenchmark: true,
    compact: false
  }; // the demo starts without the welcome card: its buttons change the portfolio

  const WEB_UI = {
    welcome: false
  };
  let over = {};
  let undo = [];

  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (s && s.recordedAt === REC.recordedAt && s.over && typeof s.over === "object") over = s.over;
  } catch (e) {
    over = {};
  }

  const saveStore = () => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        recordedAt: REC.recordedAt,
        over: over
      }));
    } catch (e) {
      /* ok */
    }
  };

  const main = () => {
    const m = REC.main;
    const d = Object.assign({}, m.data);
    d.ui = narrowUi(Object.assign({}, m.data.ui, WEB_UI, over));
    if (typeof over.title === "string") d.name = over.title;
    const age = Math.max(0, Math.round(Date.now() / 1000 - (d.epoch || REC.recordedAt)));
    return JSON.stringify(Object.assign({}, m, {
      status: "ready",
      cacheAgeSeconds: age,
      progress: null,
      historyProgress: null,
      updateResult: null,
      lastFetchFailed: false,
      data: d
    }));
  };

  const err = msg => JSON.stringify({
    error: msg || DEMO_NOTE
  });

  const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));

  const parseVal = (key, v) => {
    const t = String(v).trim();
    const low = t.toLowerCase();

    if (key === "display") {
      if (low === "default") return null;

      try {
        const o = JSON.parse(t);
        return o && typeof o === "object" ? o : undefined;
      } catch (e) {
        return undefined;
      }
    }

    if (key === "position") {
      if (low === "default") return null;
      const m = /^(-?\d{1,6}),(-?\d{1,6})$/.exec(t);
      return m ? {
        x: clampInt(+m[1], -10000, 20000),
        y: clampInt(+m[2], 0, 20000)
      } : undefined;
    }

    if (key === "scale") return low === "default" ? 1 : isFinite(+t) && t !== "" ? Math.round(Math.max(0.6, Math.min(1.6, +t)) * 100) / 100 : undefined;
    if (key === "opacity") return low === "default" ? 0.88 : isFinite(+t) && t !== "" ? Math.round(Math.max(0.3, Math.min(1, +t)) * 100) / 100 : undefined;
    if (key === "theme") return low === "default" ? "dark" : ["dark", "light", "auto"].indexOf(low) >= 0 ? low : undefined;
    if (key === "title") return low === "" || low === "default" ? "portfolio" : t.length <= 40 && !/[\r\n]/.test(t) ? t : undefined;
    if (key === "rebalanceWhole" && (low === "default" || low === "none")) return null;
    if (["true", "1", "on", "yes"].indexOf(low) >= 0) return true;
    if (["false", "0", "off", "no"].indexOf(low) >= 0) return false;
    if (low === "default") return {
      showBenchmark: true,
      graphBig: false,
      compact: false,
      updates: true,
      welcome: true
    }[key];
    return undefined;
  };

  const curUi = key => key in over ? over[key] : key in WEB_UI ? WEB_UI[key] : REC.main.data.ui[key];

  const pushUndo = (key, label, before) => {
    const rec = {
      id: Date.now(),
      key: key,
      label: label,
      t: Date.now() / 1000,
      before: before
    };
    undo.push(rec);
    if (undo.length > 5) undo.shift();
    return {
      id: rec.id,
      key: key,
      label: label,
      t: rec.t
    };
  };

  const undoView = r => r ? {
    id: r.id,
    key: r.key,
    label: r.label,
    t: r.t
  } : null;

  const setting = (key, value) => {
    if (key === "undo") {
      const top = undo[undo.length - 1];
      if (!top || String(top.id) !== String(value)) return err("nothing to undo");
      undo.pop();
      const ui = {};
      Object.keys(top.before).forEach(k => {
        if (top.before[k] === undefined) delete over[k];else over[k] = top.before[k];
        ui[k] = curUi(k);
      });
      saveStore();
      return JSON.stringify({
        ok: true,
        ui: ui,
        undone: {
          label: top.label
        },
        next: undoView(undo[undo.length - 1])
      });
    }

    if (key === "display" && String(value).trim().toLowerCase() === "reset-all") {
      const before = {};
      Object.keys(RESET_ALL).forEach(k => {
        before[k] = over[k];
        over[k] = RESET_ALL[k];
      });
      saveStore();
      return JSON.stringify({
        ok: true,
        key: "display",
        value: null,
        undo: pushUndo("display", "reset of all windows", before)
      });
    }

    if (key === "portfolio") return err();

    if (LOCAL_KEYS.indexOf(key) < 0) {
      return err(key === "news" ? "headlines need the widget on your Mac — the web demo can't fetch news" : ["benchmark", "currency", "backtestYears", "targets", "cash", "invested", "goal"].indexOf(key) >= 0 ? "the web demo can't recalculate the portfolio — get the widget for your Mac to change this" : key.indexOf("lert") >= 0 ? "alerts are Mac notifications — get the widget to use them" : DEMO_NOTE);
    }

    const v = parseVal(key, value);
    if (v === undefined) return err("not a valid value for " + key);
    const before = {};
    before[key] = over[key];
    over[key] = v;
    saveStore();
    return JSON.stringify({
      ok: true,
      key: key,
      value: v,
      undo: pushUndo(key, LABELS[key] || key, before)
    });
  };

  const days = (before, count) => {
    const all = REC.dailyAll && REC.dailyAll.rows || [];
    const rows = all.filter(r => r[0] < before);
    const n = Math.max(1, Math.min(2000, parseInt(count, 10) || 200));
    return JSON.stringify({
      rows: rows.slice(-n),
      first: all.length ? all[0][0] : null,
      total: all.length
    });
  };

  const helper = args => {
    const key = JSON.stringify(args);
    if (REC.replies[key] !== undefined) return REC.replies[key];
    const a0 = args[0];
    if (a0 === "setting") return setting(args[1], args.slice(2).join(" "));
    if (a0 === "days") return days(args[1], args[2]);
    if (a0 === "look") return err("the web demo has details only for the demo stocks");
    if (a0 === "search") return err("searching needs the widget on your Mac");
    if (a0 === "quote") return err("adding stocks needs the widget on your Mac — this is a demo portfolio");
    if (a0 === "buy" || a0 === "sell") return "error: " + DEMO_NOTE;
    return err();
  };

  const later = fn => new Promise((res, rej) => setTimeout(() => {
    try {
      res(fn());
    } catch (e) {
      rej(e);
    }
  }, 25 + Math.random() * 40));

  return {
    kind: "replay",
    recordedAt: REC.recordedAt,
    main: () => later(main),
    helper: args => later(() => helper(args)),
    forget: () => {
      try {
        localStorage.removeItem(STORE_KEY);
      } catch (e) {
        /* ok */
      }
    }
  };
}

const run = cmd => {
  cmd = String(cmd);
  if (/^if cd /.test(cmd) && /widget_command\.sh; else/.test(cmd)) return backend.main();
  let m = /widget_command\.sh\s?(.*)$/s.exec(cmd);
  if (m) return backend.helper(shellWords(m[1]));
  m = /^open '(https:\/\/[^']+)'$/.exec(cmd);

  if (m) {
    window.open(m[1], "_blank", "noopener");
    return Promise.resolve("");
  }

  m = /^printf %s (.*) \| pbcopy$/s.exec(cmd);

  if (m) {
    const text = shellWords(m[1]).join(" ");
    return navigator.clipboard ? navigator.clipboard.writeText(text).then(() => "") : Promise.reject(new Error("no clipboard"));
  }

  if (/^open -R /.test(cmd)) {
    return backend.kind === "live" ? Promise.resolve("") : Promise.reject(new Error("Finder is on the Mac — not in the web demo"));
  }

  return Promise.reject(new Error("not available in the browser"));
};

module.exports.run = run;
module.exports.css = css;
module.exports.React = React;
module.exports.replayBackend = replayBackend;
module.exports.patchDataText = patchDataText;

module.exports.setBackend = b => {
  backend = b;
};

module.exports.backend = () => backend; // ---- the widget lifecycle (what Übersicht's VirtualDomWidget does)


module.exports.start = (widget, be, mount) => {
  backend = be;
  let state = widget.initialState;
  let queued = false;
  const el = mount;

  const paint = () => {
    queued = false;

    try {
      ReactDom.render(widget.render(state, dispatch), el);
    } catch (e) {
      showError(e);
    }
  };

  const schedule = () => {
    if (queued) return;
    queued = true;
    let done = false;

    const go = () => {
      if (!done) {
        done = true;
        paint();
      }
    };

    requestAnimationFrame(go);
    setTimeout(go, 100); // background tabs get no animation frames
  };

  function dispatch(event) {
    try {
      state = widget.updateState(event, state);
      schedule();
    } catch (e) {
      showError(e);
    }
  }

  const showError = e => {
    console.error(e);
    el.innerHTML = "";
    const p = document.createElement("pre");
    p.className = "pw-crash";
    p.textContent = "The widget hit an error: " + (e && e.message ? e.message : e);
    el.appendChild(p);
  };

  el.classList.add("widget");
  if (widget.className) el.classList.add(css(widget.className));
  if (widget.init) widget.init(dispatch);
  schedule();
  let timer = null,
      busy = false,
      again = false;

  const tick = () => {
    clearTimeout(timer);
    busy = true;
    const c = widget.command;
    const p = typeof c === "function" ? Promise.resolve(c(dispatch)) : typeof c === "string" ? run(c) : Promise.resolve();
    p.then(output => dispatch({
      type: "UB/COMMAND_RAN",
      output: output
    }), error => dispatch({
      type: "UB/COMMAND_RAN",
      error: error
    })).then(() => {
      busy = false;

      if (again) {
        again = false;
        tick();
        return;
      }

      timer = setTimeout(tick, widget.refreshFrequency || 1000);
    });
  }; // run the command now (the engine just finished something) instead of
  // waiting up to refreshFrequency for the next tick


  kick = () => {
    if (busy) again = true;else tick();
  };

  tick();
};

let kick = () => {};

module.exports.kick = () => kick();

},{"emotion":11,"react":17,"react-dom":15}],"pw-widget":[function(require,module,exports){
"use strict";Object.defineProperty(exports,"__esModule",{value:true});exports.render=exports.className=exports.updateState=exports.initialState=exports.refreshFrequency=exports.command=void 0;var _uebersicht=require("uebersicht");function _templateObject191(){const data=_taggedTemplateLiteral([""," ",""]);_templateObject191=function(){return data;};return data;}function _templateObject190(){const data=_taggedTemplateLiteral([""," font-size: 8.5px; color: ",";"]);_templateObject190=function(){return data;};return data;}function _templateObject189(){const data=_taggedTemplateLiteral([""," font-size: 8px; color: ","; margin-top: 1px; display: flex; flex-wrap: wrap; justify-content: center; white-space: normal;"]);_templateObject189=function(){return data;};return data;}function _templateObject188(){const data=_taggedTemplateLiteral([""," font-size: 8px; color: ","; text-align: center; margin-top: 1px; white-space: nowrap;"]);_templateObject188=function(){return data;};return data;}function _templateObject187(){const data=_taggedTemplateLiteral([""," font-size: 8px; color: ","; white-space: nowrap; min-width: 40px; text-align: right;"]);_templateObject187=function(){return data;};return data;}function _templateObject186(){const data=_taggedTemplateLiteral([""," font-size: 8px; color: ","; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: ","px; margin: 0 8px;"]);_templateObject186=function(){return data;};return data;}function _templateObject185(){const data=_taggedTemplateLiteral([""," font-size: 8px; color: ","; white-space: nowrap; min-width: 40px;"]);_templateObject185=function(){return data;};return data;}function _templateObject184(){const data=_taggedTemplateLiteral([""," ",""]);_templateObject184=function(){return data;};return data;}function _templateObject183(){const data=_taggedTemplateLiteral([""," ",""]);_templateObject183=function(){return data;};return data;}function _templateObject182(){const data=_taggedTemplateLiteral([""," ",""]);_templateObject182=function(){return data;};return data;}function _templateObject181(){const data=_taggedTemplateLiteral(["color:",";"]);_templateObject181=function(){return data;};return data;}function _templateObject180(){const data=_taggedTemplateLiteral([""," ",""]);_templateObject180=function(){return data;};return data;}function _templateObject179(){const data=_taggedTemplateLiteral([""," font-size:8px; color:",";"]);_templateObject179=function(){return data;};return data;}function _templateObject178(){const data=_taggedTemplateLiteral([""," font-size:8.5px; color:","; margin-top:3px;"]);_templateObject178=function(){return data;};return data;}function _templateObject177(){const data=_taggedTemplateLiteral([""," font-size: 8px; color: ",";"]);_templateObject177=function(){return data;};return data;}function _templateObject176(){const data=_taggedTemplateLiteral([""," font-size:8px; color:",";"]);_templateObject176=function(){return data;};return data;}function _templateObject175(){const data=_taggedTemplateLiteral([""," font-size:8.5px; color:","; margin-top:3px;"]);_templateObject175=function(){return data;};return data;}function _templateObject174(){const data=_taggedTemplateLiteral([""," font-size: 8px; color: ",";"]);_templateObject174=function(){return data;};return data;}function _templateObject173(){const data=_taggedTemplateLiteral(["font-size:10px; color:","; margin-top:4px;"]);_templateObject173=function(){return data;};return data;}function _templateObject172(){const data=_taggedTemplateLiteral([""," font-size: 9px; color: ",";"]);_templateObject172=function(){return data;};return data;}function _templateObject171(){const data=_taggedTemplateLiteral(["font-size:10px; color:","; margin-top:8px; line-height:1.5;"]);_templateObject171=function(){return data;};return data;}function _templateObject170(){const data=_taggedTemplateLiteral(["font-size:10px; color:","; margin-top:8px; line-height:1.5;"]);_templateObject170=function(){return data;};return data;}function _templateObject169(){const data=_taggedTemplateLiteral(["display: flex; justify-content: flex-end; flex-wrap: wrap; min-width: 0; margin-top: 2px;"]);_templateObject169=function(){return data;};return data;}function _templateObject168(){const data=_taggedTemplateLiteral([""," ",""]);_templateObject168=function(){return data;};return data;}function _templateObject167(){const data=_taggedTemplateLiteral([""," ",""]);_templateObject167=function(){return data;};return data;}function _templateObject166(){const data=_taggedTemplateLiteral(["font-size:10px; color:","; margin-top:8px;"]);_templateObject166=function(){return data;};return data;}function _templateObject165(){const data=_taggedTemplateLiteral([""," font-size:8.5px; color:","; margin-top:3px;"]);_templateObject165=function(){return data;};return data;}function _templateObject164(){const data=_taggedTemplateLiteral([""," font-size: 8px; color: ","; margin-top: 4px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"]);_templateObject164=function(){return data;};return data;}function _templateObject163(){const data=_taggedTemplateLiteral([""," font-size: 9px; color: ","; margin-top: 6px; cursor: pointer;"]);_templateObject163=function(){return data;};return data;}function _templateObject162(){const data=_taggedTemplateLiteral([""," font-size: 8px; color: ",";"]);_templateObject162=function(){return data;};return data;}function _templateObject161(){const data=_taggedTemplateLiteral([""," font-size: 8px; color: ",";"]);_templateObject161=function(){return data;};return data;}function _templateObject160(){const data=_taggedTemplateLiteral(["display:flex; justify-content:space-between;"]);_templateObject160=function(){return data;};return data;}function _templateObject159(){const data=_taggedTemplateLiteral([""," display:flex; justify-content:space-between;"]);_templateObject159=function(){return data;};return data;}function _templateObject158(){const data=_taggedTemplateLiteral([""," font-size: 8.5px; color: ","; margin-top: 4px; line-height: 1.5;"]);_templateObject158=function(){return data;};return data;}function _templateObject157(){const data=_taggedTemplateLiteral([""," font-size: 9px; color: ",";"]);_templateObject157=function(){return data;};return data;}function _templateObject156(){const data=_taggedTemplateLiteral([""," font-size: 9px; color: ",";"]);_templateObject156=function(){return data;};return data;}function _templateObject155(){const data=_taggedTemplateLiteral([""," font-size: 9px; color: ",";"]);_templateObject155=function(){return data;};return data;}function _templateObject154(){const data=_taggedTemplateLiteral([""," font-size: 9px; color: ",";"]);_templateObject154=function(){return data;};return data;}function _templateObject153(){const data=_taggedTemplateLiteral([""," font-size: 9px; color: ",";"]);_templateObject153=function(){return data;};return data;}function _templateObject152(){const data=_taggedTemplateLiteral([""," font-size: 9px; color: ","; cursor: pointer;"]);_templateObject152=function(){return data;};return data;}function _templateObject151(){const data=_taggedTemplateLiteral([""," font-size: 9px; color: ",";"]);_templateObject151=function(){return data;};return data;}function _templateObject150(){const data=_taggedTemplateLiteral([""," font-size: 22px; letter-spacing: -0.02em;"]);_templateObject150=function(){return data;};return data;}function _templateObject149(){const data=_taggedTemplateLiteral(["color:","; font-size:10px; margin-top:6px;"]);_templateObject149=function(){return data;};return data;}function _templateObject148(){const data=_taggedTemplateLiteral(["color:","; font-size:9px; margin-top:4px; word-break:break-all; font-family:\"SF Mono\",Menlo,monospace;"]);_templateObject148=function(){return data;};return data;}function _templateObject147(){const data=_taggedTemplateLiteral(["color:","; font-size:11px; margin-top:6px;"]);_templateObject147=function(){return data;};return data;}function _templateObject146(){const data=_taggedTemplateLiteral([""," ",""]);_templateObject146=function(){return data;};return data;}function _templateObject145(){const data=_taggedTemplateLiteral([""," ",""]);_templateObject145=function(){return data;};return data;}function _templateObject144(){const data=_taggedTemplateLiteral([""," ",""]);_templateObject144=function(){return data;};return data;}function _templateObject143(){const data=_taggedTemplateLiteral(["\n  color: ",";\n  background: rgba(var(--pw-fg), 0.1);\n"]);_templateObject143=function(){return data;};return data;}function _templateObject142(){const data=_taggedTemplateLiteral(["\n  cursor: pointer;\n  padding: 1px 4px;\n  border-radius: 3px;\n  color: ",";\n  white-space: nowrap;\n"]);_templateObject142=function(){return data;};return data;}function _templateObject141(){const data=_taggedTemplateLiteral(["\n  display: flex;\n  flex-wrap: wrap;\n  align-items: baseline;\n  column-gap: 6px;\n  row-gap: 2px;\n  margin-top: 4px;\n  min-width: 0;\n"]);_templateObject141=function(){return data;};return data;}function _templateObject140(){const data=_taggedTemplateLiteral(["\n  color: ",";\n  opacity: 0.8;\n  font-size: 8.5px;\n  line-height: 1.4;\n  margin: 1px 0 2px;\n  white-space: normal;\n  min-width: 0;\n"]);_templateObject140=function(){return data;};return data;}function _templateObject139(){const data=_taggedTemplateLiteral(["\n  display: flex;\n  align-items: baseline;\n  column-gap: 6px;\n  margin-top: 8px;\n  padding-top: 5px;\n  border-top: 1px solid rgba(var(--pw-fg), 0.08);\n  color: ",";\n  min-width: 0;\n"]);_templateObject139=function(){return data;};return data;}function _templateObject138(){const data=_taggedTemplateLiteral(["\n  color: ",";\n"]);_templateObject138=function(){return data;};return data;}function _templateObject137(){const data=_taggedTemplateLiteral(["\n  cursor: pointer;\n  font-size: 9.5px;\n  color: ",";\n  margin-top: 5px;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n"]);_templateObject137=function(){return data;};return data;}function _templateObject136(){const data=_taggedTemplateLiteral(["\n  margin: 2px 0 10px;\n  padding: 5px 8px 6px;\n  border: 1px solid rgba(var(--pw-fg), 0.14);\n  border-radius: 8px;\n  background: rgba(var(--pw-fg), 0.03);\n  font-family: \"SF Mono\", Menlo, monospace;\n  font-size: 9.5px;\n  line-height: 1.45;\n  color: ",";\n  min-width: 0;\n  max-width: 100%;\n  box-sizing: border-box;\n"]);_templateObject136=function(){return data;};return data;}function _templateObject135(){const data=_taggedTemplateLiteral([""," font-size: 8px; color: ","; margin-top: 2px;"]);_templateObject135=function(){return data;};return data;}function _templateObject134(){const data=_taggedTemplateLiteral(["height:2px; background:","; border-radius:1px;"]);_templateObject134=function(){return data;};return data;}function _templateObject133(){const data=_taggedTemplateLiteral([""," font-size: 8px; color: ","; margin-top: 4px;"]);_templateObject133=function(){return data;};return data;}function _templateObject132(){const data=_taggedTemplateLiteral([""," font-size: 8.5px; color: ","; margin-top: 3px;"]);_templateObject132=function(){return data;};return data;}function _templateObject131(){const data=_taggedTemplateLiteral([""," font-size: 8.5px; color: ",";"]);_templateObject131=function(){return data;};return data;}function _templateObject130(){const data=_taggedTemplateLiteral([""," font-size: 8.5px; color: ","; margin-top: 2px;"]);_templateObject130=function(){return data;};return data;}function _templateObject129(){const data=_taggedTemplateLiteral([""," font-size: 9px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"]);_templateObject129=function(){return data;};return data;}function _templateObject128(){const data=_taggedTemplateLiteral([""," font-size: 8px; color: ",";"]);_templateObject128=function(){return data;};return data;}function _templateObject127(){const data=_taggedTemplateLiteral(["font-size:10px; color:","; margin-top:5px;"]);_templateObject127=function(){return data;};return data;}function _templateObject126(){const data=_taggedTemplateLiteral(["flex:1; min-width:14px; height:4px; background:rgba(var(--pw-fg), 0.12); border-radius:2px; margin:0 6px;"]);_templateObject126=function(){return data;};return data;}function _templateObject125(){const data=_taggedTemplateLiteral([""," font-size: 8px; color: ","; margin-top: 3px;"]);_templateObject125=function(){return data;};return data;}function _templateObject124(){const data=_taggedTemplateLiteral(["display:flex; height:6px; border-radius:3px; overflow:hidden; margin-top:8px;"]);_templateObject124=function(){return data;};return data;}function _templateObject123(){const data=_taggedTemplateLiteral(["flex:1;"]);_templateObject123=function(){return data;};return data;}function _templateObject122(){const data=_taggedTemplateLiteral(["display:flex; gap:12px; margin-top:5px;"]);_templateObject122=function(){return data;};return data;}function _templateObject121(){const data=_taggedTemplateLiteral([""," font-size:8.5px; color:","; margin-top:3px;"]);_templateObject121=function(){return data;};return data;}function _templateObject120(){const data=_taggedTemplateLiteral([""," font-size: 8px; color: ",";"]);_templateObject120=function(){return data;};return data;}function _templateObject119(){const data=_taggedTemplateLiteral([""," font-size:8.5px; color:",";"]);_templateObject119=function(){return data;};return data;}function _templateObject118(){const data=_taggedTemplateLiteral([""," font-size:8px; color:",";"]);_templateObject118=function(){return data;};return data;}function _templateObject117(){const data=_taggedTemplateLiteral([""," font-size:8.5px; color:",";"]);_templateObject117=function(){return data;};return data;}function _templateObject116(){const data=_taggedTemplateLiteral([""," font-size:8.5px; color:",";"]);_templateObject116=function(){return data;};return data;}function _templateObject115(){const data=_taggedTemplateLiteral([""," font-size:8.5px; color:","; margin-top:3px;"]);_templateObject115=function(){return data;};return data;}function _templateObject114(){const data=_taggedTemplateLiteral([""," font-size:8.5px; color:","; margin-top:3px;"]);_templateObject114=function(){return data;};return data;}function _templateObject113(){const data=_taggedTemplateLiteral([""," ",""]);_templateObject113=function(){return data;};return data;}function _templateObject112(){const data=_taggedTemplateLiteral(["\n  cursor: pointer; color: ","; padding: 0 2px; margin-left: 4px;\n  &:hover { color: ","; }\n"]);_templateObject112=function(){return data;};return data;}function _templateObject111(){const data=_taggedTemplateLiteral(["\n  font-family: \"SF Mono\", Menlo, monospace;\n  font-size: 8px; color: ","; cursor: pointer; padding: 0 3px; border-radius: 3px;\n  background: rgba(var(--pw-fg), 0.06); white-space: nowrap;\n  &:hover { color: ","; }\n"]);_templateObject111=function(){return data;};return data;}function _templateObject110(){const data=_taggedTemplateLiteral(["\n  cursor: pointer;\n  &:hover { color: ","; text-decoration: underline; }\n"]);_templateObject110=function(){return data;};return data;}function _templateObject109(){const data=_taggedTemplateLiteral(["\n  & .pw-mute { visibility: hidden; color: ","; cursor: pointer; margin-left: 3px; }\n  &:hover .pw-mute { visibility: visible; }\n  & .pw-mute:hover { color: ","; }\n"]);_templateObject109=function(){return data;};return data;}function _templateObject108(){const data=_taggedTemplateLiteral([""," font-size: 8.5px; color: ","; margin-top: 3px;"]);_templateObject108=function(){return data;};return data;}function _templateObject107(){const data=_taggedTemplateLiteral([""," font-size: 8px; color: ",";"]);_templateObject107=function(){return data;};return data;}function _templateObject106(){const data=_taggedTemplateLiteral([""," font-size: 8.5px; color: ","; margin-top: 3px;"]);_templateObject106=function(){return data;};return data;}function _templateObject105(){const data=_taggedTemplateLiteral([""," font-size: 8.5px; color: ","; margin-top: 3px;"]);_templateObject105=function(){return data;};return data;}function _templateObject104(){const data=_taggedTemplateLiteral([""," ",""]);_templateObject104=function(){return data;};return data;}function _templateObject103(){const data=_taggedTemplateLiteral([""," font-size: 8.5px; color: ","; margin-top: 3px;"]);_templateObject103=function(){return data;};return data;}function _templateObject102(){const data=_taggedTemplateLiteral([""," font-size: 8.5px; color: ",";"]);_templateObject102=function(){return data;};return data;}function _templateObject101(){const data=_taggedTemplateLiteral([""," font-size: 8.5px; color: ",";"]);_templateObject101=function(){return data;};return data;}function _templateObject100(){const data=_taggedTemplateLiteral([""," font-size: 8px; color: ",";"]);_templateObject100=function(){return data;};return data;}function _templateObject99(){const data=_taggedTemplateLiteral(["flex:1; min-width:14px; height:4px; background:rgba(var(--pw-fg), 0.12); border-radius:2px; margin:0 6px;"]);_templateObject99=function(){return data;};return data;}function _templateObject98(){const data=_taggedTemplateLiteral([""," font-size: 8.5px; color: ",";"]);_templateObject98=function(){return data;};return data;}function _templateObject97(){const data=_taggedTemplateLiteral([""," font-size: 9px; color: ",";"]);_templateObject97=function(){return data;};return data;}function _templateObject96(){const data=_taggedTemplateLiteral([""," font-size:8px; color:",";"]);_templateObject96=function(){return data;};return data;}function _templateObject95(){const data=_taggedTemplateLiteral([""," font-size:9px;"]);_templateObject95=function(){return data;};return data;}function _templateObject94(){const data=_taggedTemplateLiteral([""," font-size:8px; color:",";"]);_templateObject94=function(){return data;};return data;}function _templateObject93(){const data=_taggedTemplateLiteral([""," font-size: 8px; color: ",";"]);_templateObject93=function(){return data;};return data;}function _templateObject92(){const data=_taggedTemplateLiteral(["font-size:9px; color:","; margin-top:5px;"]);_templateObject92=function(){return data;};return data;}function _templateObject91(){const data=_taggedTemplateLiteral([""," ",""]);_templateObject91=function(){return data;};return data;}function _templateObject90(){const data=_taggedTemplateLiteral([""," ",""]);_templateObject90=function(){return data;};return data;}function _templateObject89(){const data=_taggedTemplateLiteral([""," ",""]);_templateObject89=function(){return data;};return data;}function _templateObject88(){const data=_taggedTemplateLiteral([""," ",""]);_templateObject88=function(){return data;};return data;}function _templateObject87(){const data=_taggedTemplateLiteral([""," ",""]);_templateObject87=function(){return data;};return data;}function _templateObject86(){const data=_taggedTemplateLiteral([""," ",""]);_templateObject86=function(){return data;};return data;}function _templateObject85(){const data=_taggedTemplateLiteral([""," ",""]);_templateObject85=function(){return data;};return data;}function _templateObject84(){const data=_taggedTemplateLiteral([""," ",""]);_templateObject84=function(){return data;};return data;}function _templateObject83(){const data=_taggedTemplateLiteral([""," ",""]);_templateObject83=function(){return data;};return data;}function _templateObject82(){const data=_taggedTemplateLiteral([""," ",""]);_templateObject82=function(){return data;};return data;}function _templateObject81(){const data=_taggedTemplateLiteral([""," font-size: 8px; color: ",";"]);_templateObject81=function(){return data;};return data;}function _templateObject80(){const data=_taggedTemplateLiteral([""," ",""]);_templateObject80=function(){return data;};return data;}function _templateObject79(){const data=_taggedTemplateLiteral(["\n  display: flex;\n  align-items: baseline;\n  justify-content: space-between;\n  margin-top: 4px;\n  font-size: 9.5px;\n"]);_templateObject79=function(){return data;};return data;}function _templateObject78(){const data=_taggedTemplateLiteral(["height:","px; display:flex; align-items:center; justify-content:center; color:","; font-size:10px;"]);_templateObject78=function(){return data;};return data;}function _templateObject77(){const data=_taggedTemplateLiteral(["color:","; font-size:9px; margin-top:5px; white-space:pre-wrap; word-break:break-word; font-family:\"SF Mono\",Menlo,monospace; line-height:1.5; user-select: text; -webkit-user-select: text; cursor: text;"]);_templateObject77=function(){return data;};return data;}function _templateObject76(){const data=_taggedTemplateLiteral(["margin-top:7px;"]);_templateObject76=function(){return data;};return data;}function _templateObject75(){const data=_taggedTemplateLiteral([""," ",""]);_templateObject75=function(){return data;};return data;}function _templateObject74(){const data=_taggedTemplateLiteral(["color:","; font-size:10px; line-height:1.45; margin-top:6px; white-space:pre-wrap; word-break:break-word;"]);_templateObject74=function(){return data;};return data;}function _templateObject73(){const data=_taggedTemplateLiteral([""," display:block; font-size:9.5px; user-select: text; -webkit-user-select: text; cursor: text; word-break: break-all;"]);_templateObject73=function(){return data;};return data;}function _templateObject72(){const data=_taggedTemplateLiteral(["margin-top:4px; line-height:1.5;"]);_templateObject72=function(){return data;};return data;}function _templateObject71(){const data=_taggedTemplateLiteral([""," ",""]);_templateObject71=function(){return data;};return data;}function _templateObject70(){const data=_taggedTemplateLiteral(["color:","; font-size:10px; line-height:1.45; margin-top:6px;"]);_templateObject70=function(){return data;};return data;}function _templateObject69(){const data=_taggedTemplateLiteral(["color:","; font-size:9px; line-height:1.45; margin-top:7px;"]);_templateObject69=function(){return data;};return data;}function _templateObject68(){const data=_taggedTemplateLiteral(["display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-top:7px;"]);_templateObject68=function(){return data;};return data;}function _templateObject67(){const data=_taggedTemplateLiteral([""," ",""]);_templateObject67=function(){return data;};return data;}function _templateObject66(){const data=_taggedTemplateLiteral(["font-size:9px; margin-top:5px; line-height:1.4;"]);_templateObject66=function(){return data;};return data;}function _templateObject65(){const data=_taggedTemplateLiteral([""," ",""]);_templateObject65=function(){return data;};return data;}function _templateObject64(){const data=_taggedTemplateLiteral([""," ",""]);_templateObject64=function(){return data;};return data;}function _templateObject63(){const data=_taggedTemplateLiteral([""," font-size:8.5px; line-height:1.4; max-width: 250px;"]);_templateObject63=function(){return data;};return data;}function _templateObject62(){const data=_taggedTemplateLiteral([""," font-size:8.5px; margin-top:4px;"]);_templateObject62=function(){return data;};return data;}function _templateObject61(){const data=_taggedTemplateLiteral([""," font-size:8.5px; color:","; margin-top:3px;"]);_templateObject61=function(){return data;};return data;}function _templateObject60(){const data=_taggedTemplateLiteral(["margin-top:6px; padding:7px; border:1px solid ","; border-radius:8px;"]);_templateObject60=function(){return data;};return data;}function _templateObject59(){const data=_taggedTemplateLiteral(["\n  display: flex;\n  flex-wrap: wrap;\n  align-items: baseline;\n  column-gap: 6px;\n  margin-top: 2px;\n  min-width: 0;\n"]);_templateObject59=function(){return data;};return data;}function _templateObject58(){const data=_taggedTemplateLiteral([""," background: rgba(var(--pw-fg), 0.10); color: ","; border-radius: 9px; padding: 2px 7px; &:hover { background: rgba(var(--pw-fg), 0.18); }"]);_templateObject58=function(){return data;};return data;}function _templateObject57(){const data=_taggedTemplateLiteral(["\n  margin-top: 8px;\n  padding: 7px 10px 8px;\n  border: 1px solid rgba(var(--pw-fg), 0.14);\n  border-radius: 8px;\n  background: rgba(var(--pw-fg), 0.04);\n  font-size: 10px;\n  line-height: 1.5;\n"]);_templateObject57=function(){return data;};return data;}function _templateObject56(){const data=_taggedTemplateLiteral([""," ",""]);_templateObject56=function(){return data;};return data;}function _templateObject55(){const data=_taggedTemplateLiteral([""," font-size:8.5px; max-width: 150px; line-height:1.4;"]);_templateObject55=function(){return data;};return data;}function _templateObject54(){const data=_taggedTemplateLiteral([""," ",""]);_templateObject54=function(){return data;};return data;}function _templateObject53(){const data=_taggedTemplateLiteral([""," font-size:9px; color:","; line-height:1.4;"]);_templateObject53=function(){return data;};return data;}function _templateObject52(){const data=_taggedTemplateLiteral(["display:flex; gap:6px; margin-top:5px;"]);_templateObject52=function(){return data;};return data;}function _templateObject51(){const data=_taggedTemplateLiteral([""," font-size:8.5px; color:","; margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"]);_templateObject51=function(){return data;};return data;}function _templateObject50(){const data=_taggedTemplateLiteral(["display:flex; gap:6px;"]);_templateObject50=function(){return data;};return data;}function _templateObject49(){const data=_taggedTemplateLiteral(["margin-top:6px; padding:7px; border:1px solid ","; border-radius:8px;"]);_templateObject49=function(){return data;};return data;}function _templateObject48(){const data=_taggedTemplateLiteral([""," ",""]);_templateObject48=function(){return data;};return data;}function _templateObject47(){const data=_taggedTemplateLiteral([""," ",""]);_templateObject47=function(){return data;};return data;}function _templateObject46(){const data=_taggedTemplateLiteral([""," font-size:8.5px; color:","; margin-top:4px;"]);_templateObject46=function(){return data;};return data;}function _templateObject45(){const data=_taggedTemplateLiteral(["margin-top:4px; border:1px solid ","; border-radius:6px; overflow:hidden;"]);_templateObject45=function(){return data;};return data;}function _templateObject44(){const data=_taggedTemplateLiteral(["\n  display: flex;\n  justify-content: space-between;\n  align-items: baseline;\n  padding: 3px 6px;\n  cursor: pointer;\n  font-size: 9.5px;\n  &:hover { background: rgba(var(--pw-fg), 0.07); }\n"]);_templateObject44=function(){return data;};return data;}function _templateObject43(){const data=_taggedTemplateLiteral([""," font-size: 8px; color: ","; margin-top: 2px;"]);_templateObject43=function(){return data;};return data;}function _templateObject42(){const data=_taggedTemplateLiteral(["display: flex; gap: 6px; align-items: center; margin-top: 4px;"]);_templateObject42=function(){return data;};return data;}function _templateObject41(){const data=_taggedTemplateLiteral(["display: grid; grid-template-columns: 1fr 1fr; column-gap: 10px;"]);_templateObject41=function(){return data;};return data;}function _templateObject40(){const data=_taggedTemplateLiteral(["display: grid; grid-template-columns: 1fr 1fr; column-gap: 10px; row-gap: 3px; margin-top: 3px;"]);_templateObject40=function(){return data;};return data;}function _templateObject39(){const data=_taggedTemplateLiteral(["display: grid; grid-template-columns: 1fr 1fr; column-gap: 10px;"]);_templateObject39=function(){return data;};return data;}function _templateObject38(){const data=_taggedTemplateLiteral([""," display: flex; justify-content: space-between; font-size: 8.5px; color: ","; margin-bottom: 3px;"]);_templateObject38=function(){return data;};return data;}function _templateObject37(){const data=_taggedTemplateLiteral([""," ",""]);_templateObject37=function(){return data;};return data;}function _templateObject36(){const data=_taggedTemplateLiteral(["\n  display: flex;\n  align-items: baseline;\n  gap: 6px;\n  padding: 1px 4px;\n  border-radius: 3px;\n  cursor: pointer;\n  white-space: nowrap;\n  overflow: hidden;\n  font-size: 8.5px;\n  &:hover { background: rgba(var(--pw-fg), 0.07); }\n"]);_templateObject36=function(){return data;};return data;}function _templateObject35(){const data=_taggedTemplateLiteral(["\n  margin: 3px auto 0;\n  padding: 5px 7px 6px;\n  border: 1px solid rgba(var(--pw-fg), 0.12);\n  border-radius: 6px;\n  background: rgba(var(--pw-fg), 0.03);\n  max-height: 176px;\n  overflow-y: auto;\n  box-sizing: border-box;\n  width: 100%;\n  max-width: 560px;\n  &::-webkit-scrollbar { width: 6px; }\n  &::-webkit-scrollbar-thumb { background: rgba(var(--pw-fg), 0.13); border-radius: 3px; }\n"]);_templateObject35=function(){return data;};return data;}function _templateObject34(){const data=_taggedTemplateLiteral(["\n  background: rgba(var(--pw-fg), 0.06);\n  border: 1px solid rgba(var(--pw-fg), 0.12);\n  border-radius: 4px;\n  color: ",";\n  font-family: \"SF Mono\", Menlo, monospace;\n  font-size: 9px;\n  padding: 1px 5px;\n  margin-left: 6px;\n  outline: none;\n  width: 76px;\n  box-sizing: border-box;\n"]);_templateObject34=function(){return data;};return data;}function _templateObject33(){const data=_taggedTemplateLiteral(["\n  background: rgba(var(--pw-fg), 0.06);\n  border: 1px solid rgba(var(--pw-fg), 0.12);\n  border-radius: 4px;\n  color: ",";\n  font-family: \"SF Mono\", Menlo, monospace;\n  font-size: 9.5px;\n  padding: 3px 5px;\n  outline: none;\n  width: 100%;\n  box-sizing: border-box;\n"]);_templateObject33=function(){return data;};return data;}function _templateObject32(){const data=_taggedTemplateLiteral([""," ",""]);_templateObject32=function(){return data;};return data;}function _templateObject31(){const data=_taggedTemplateLiteral(["height: ","px; display: flex; align-items: center; justify-content: center; color: ","; font-size: 10px;"]);_templateObject31=function(){return data;};return data;}function _templateObject30(){const data=_taggedTemplateLiteral(["height: ","px; display: flex; align-items: center; justify-content: center; color: ","; font-size: 10px;"]);_templateObject30=function(){return data;};return data;}function _templateObject29(){const data=_taggedTemplateLiteral(["\n  border-radius: 6px;\n  padding: 3px 5px 2px;\n  margin: -3px -5px -2px;\n  cursor: zoom-in;\n  &:hover { background: rgba(var(--pw-fg), 0.055); }\n"]);_templateObject29=function(){return data;};return data;}function _templateObject28(){const data=_taggedTemplateLiteral(["height: ","px; display: flex; align-items: center; justify-content: center; color: ","; font-size: 10px;"]);_templateObject28=function(){return data;};return data;}function _extends(){_extends=Object.assign||function(target){for(var i=1;i<arguments.length;i++){var source=arguments[i];for(var key in source){if(Object.prototype.hasOwnProperty.call(source,key)){target[key]=source[key];}}}return target;};return _extends.apply(this,arguments);}function _templateObject27(){const data=_taggedTemplateLiteral([""," ",""]);_templateObject27=function(){return data;};return data;}function _templateObject26(){const data=_taggedTemplateLiteral(["\n  position: absolute;\n  right: 2px;\n  bottom: 2px;\n  width: 12px;\n  height: 12px;\n  cursor: nwse-resize;\n"]);_templateObject26=function(){return data;};return data;}function _templateObject25(){const data=_taggedTemplateLiteral(["\n  position: absolute;\n  left: 0;\n  right: 14px;\n  bottom: 0;\n  height: 5px;\n  cursor: ns-resize;\n"]);_templateObject25=function(){return data;};return data;}function _templateObject24(){const data=_taggedTemplateLiteral(["\n  position: absolute;\n  top: 0;\n  right: 0;\n  bottom: 14px;\n  width: 5px;\n  cursor: ew-resize;\n"]);_templateObject24=function(){return data;};return data;}function _templateObject23(){const data=_taggedTemplateLiteral(["\n  position: absolute;\n  left: 3px;\n  top: 10px;\n  font-size: 10px;\n  line-height: 12px;\n  color: ",";\n  cursor: grab;\n  user-select: none;\n  -webkit-user-select: none;\n"]);_templateObject23=function(){return data;};return data;}function _templateObject22(){const data=_taggedTemplateLiteral(["\n  flex: 0 1 auto;\n  min-height: 0;\n  overflow-x: hidden;\n  overflow-y: auto;\n  margin-left: -8px;\n  padding-left: 8px;\n  margin-right: -12px;\n  padding-right: 12px;\n  &[data-over=\"1\"] { padding-right: 6px; }\n  &::-webkit-scrollbar { width: 6px; }\n  &::-webkit-scrollbar-track { background: transparent; }\n  &::-webkit-scrollbar-thumb { background: rgba(var(--pw-fg), 0.13); border-radius: 3px; }\n  &::-webkit-scrollbar-thumb:hover { background: rgba(var(--pw-fg), 0.24); }\n"]);_templateObject22=function(){return data;};return data;}function _templateObject21(){const data=_taggedTemplateLiteral(["\n  flex: none;\n  user-select: none;\n  -webkit-user-select: none;\n"]);_templateObject21=function(){return data;};return data;}function _templateObject20(){const data=_taggedTemplateLiteral(["\n  display: flex;\n  flex-direction: column;\n  box-sizing: border-box;\n"]);_templateObject20=function(){return data;};return data;}function _templateObject19(){const data=_taggedTemplateLiteral(["\n  & .pw-grip { opacity: 0; transition: opacity 0.15s; }\n  &:hover .pw-grip { opacity: 1; }\n  & .pw-gear { opacity: 0.35; transition: opacity 0.15s; }\n  &:hover .pw-gear, & .pw-gear[data-pw-open=\"1\"] { opacity: 1; }\n"]);_templateObject19=function(){return data;};return data;}function _templateObject18(){const data=_taggedTemplateLiteral(["\n  font-family: \"SF Mono\", Menlo, monospace;\n  font-size: 8.5px;\n  color: ",";\n  cursor: pointer;\n  text-decoration: underline;\n"]);_templateObject18=function(){return data;};return data;}function _templateObject17(){const data=_taggedTemplateLiteral(["\n  cursor: pointer;\n  padding: 0 3px;\n  font-size: 11px;\n  line-height: 12px;\n  border-radius: 8px;\n"]);_templateObject17=function(){return data;};return data;}function _templateObject16(){const data=_taggedTemplateLiteral(["\n  cursor: pointer;\n  padding: 0 2px;\n  font-size: 9px;\n"]);_templateObject16=function(){return data;};return data;}function _templateObject15(){const data=_taggedTemplateLiteral(["\n  color: ",";\n  background: rgba(var(--pw-fg), 0.1);\n"]);_templateObject15=function(){return data;};return data;}function _templateObject14(){const data=_taggedTemplateLiteral(["\n  font-family: \"SF Mono\", Menlo, monospace;\n  font-size: 9px;\n  color: ",";\n  padding: 2px 7px;\n  border-radius: 4px;\n  cursor: pointer;\n"]);_templateObject14=function(){return data;};return data;}function _templateObject13(){const data=_taggedTemplateLiteral(["\n  flex: 1;\n  min-width: 0;\n"]);_templateObject13=function(){return data;};return data;}function _templateObject12(){const data=_taggedTemplateLiteral(["\n  flex: 1;\n  min-width: 0;\n  padding: 0 14px;\n  border-left: 1px solid ",";\n"]);_templateObject12=function(){return data;};return data;}function _templateObject11(){const data=_taggedTemplateLiteral(["\n  flex: 1;\n  min-width: 0;\n  padding-left: 14px;\n  border-left: 1px solid ",";\n"]);_templateObject11=function(){return data;};return data;}function _templateObject10(){const data=_taggedTemplateLiteral(["\n  flex: 1.35;\n  min-width: 0;\n  padding-right: 14px;\n"]);_templateObject10=function(){return data;};return data;}function _templateObject9(){const data=_taggedTemplateLiteral(["\n  flex: 1;\n  min-width: 0;\n  padding-right: 14px;\n"]);_templateObject9=function(){return data;};return data;}function _templateObject8(){const data=_taggedTemplateLiteral(["\n  display: flex;\n  align-items: stretch;\n"]);_templateObject8=function(){return data;};return data;}function _templateObject7(){const data=_taggedTemplateLiteral(["\n  display: inline-block;\n  width: 40px;\n  height: 4px;\n  margin: 0 0 1px 6px;\n  border-radius: 2px;\n  overflow: hidden;\n  background: rgba(var(--pw-fg), 0.12);\n"]);_templateObject7=function(){return data;};return data;}function _templateObject6(){const data=_taggedTemplateLiteral(["\n  display: flex;\n  align-items: baseline;\n  justify-content: space-between;\n"]);_templateObject6=function(){return data;};return data;}function _templateObject5(){const data=_taggedTemplateLiteral(["\n  margin-top: 10px;\n  padding-top: 8px;\n  border-top: 1px solid ",";\n"]);_templateObject5=function(){return data;};return data;}function _templateObject4(){const data=_taggedTemplateLiteral(["\n  font-size: 9px;\n  letter-spacing: 0.14em;\n  text-transform: uppercase;\n  color: ",";\n"]);_templateObject4=function(){return data;};return data;}function _templateObject3(){const data=_taggedTemplateLiteral(["\n  font-family: \"SF Mono\", Menlo, monospace;\n  font-variant-numeric: tabular-nums;\n"]);_templateObject3=function(){return data;};return data;}function _templateObject2(){const data=_taggedTemplateLiteral(["\n  background: rgba(var(--pw-bg), var(--pw-opacity));\n  border: 1px solid rgba(var(--pw-fg), 0.08);\n  border-radius: 12px;\n  padding: 12px 16px 8px;\n"]);_templateObject2=function(){return data;};return data;}function _templateObject(){const data=_taggedTemplateLiteral(["\n    --pw-ink: ","; --pw-dim: ","; --pw-faint: ","; --pw-up: ","; --pw-down: ",";\n    --pw-amber: ","; --pw-orange: ","; --pw-line: ","; --pw-bg: ","; --pw-fg: ",";\n    --pw-surface: ","; --pw-tile-ink: ","; --pw-tile-sub: ","; --pw-tile-shadow: ",";\n    --pw-map-cap: ","; --pw-bench: ","; --pw-grid: ",";\n    --pw-opacity: ",";\n    color: var(--pw-ink);\n  "]);_templateObject=function(){return data;};return data;}function _taggedTemplateLiteral(strings,raw){if(!raw){raw=strings.slice(0);}return Object.freeze(Object.defineProperties(strings,{raw:{value:Object.freeze(raw)}}));}// Übersicht runs commands from the widgets folder and a widget can't find
// its own folder, so the folder name is fixed here. Renamed it? Change DIR.
const DIR="Portfolio.widget";const command="if cd \"".concat(DIR,"\" 2>/dev/null; then bash ./widget_command.sh; else ")+"echo '{\"status\":\"error\",\"cacheAgeSeconds\":0,\"lastFetchFailed\":false,\"progress\":null,\"data\":null,\"errorText\":\"This folder must be named ".concat(DIR," and sit directly inside your \xDCbersicht widgets folder (or change DIR at the top of index.jsx).\"}'; fi");exports.command=command;const refreshFrequency=5000;// rows per page, graph heights and every other size: LAYOUT_K + layoutFor (12.12)
exports.refreshFrequency=refreshFrequency;const TICKS_PER_PAGE=3;// 3 refreshes x 5 s = 15 s per page/section
const HOLD_TICKS=2*TICKS_PER_PAGE;// the holdings list turns a page every 30 s (the carousel keeps 15 s)
const OLDER_CHUNK=200;// older day rows fetched per "older ›" (data.json carries the newest ~400)
const MAX_GRAPH_PTS=1260;// a long custom span is thinned to ~2 points per pixel
const RANGES=["1H","1D","1W","1M","1Y"];const DETAIL_RANGES=["1H","1D","1W","1M","3M","1Y"];// the main graph also has "ALL" (since the first purchase) and longer tabs (d.backtest.tabs, per _settings.backtestYears): before the first
// purchase they show today's holdings simulated back ("backtest")
const BT_RANGES=["3Y","5Y","10Y","MAX"];const BT_YEARS={"3Y":3,"5Y":5,"10Y":10};const BT_MODE_WORDS={held:"as held now",weighted:"as weighted now"};const SORTS=["az","value","day","vol"];const SORT_LABEL={az:"a–z",value:"$",day:"day",vol:"vol"};const SORT_TIP={az:"sorted by ticker",value:"sorted by value, largest first",day:"sorted by today's move, best first",vol:"sorted by volatility, wildest first"};// Übersicht keeps a widget's state when it hot-reloads a changed index.jsx —
// which is exactly what happens when an update replaces this file while the
// app is running. State from another version can lack fields this one reads
// (that crashed the 12.x upgrade with "undefined is not an object"), so any
// state not stamped with this version starts over, keeping only the data
// that is already on screen. Bump it whenever the state's shape changes.
const STATE_VERSION="13.6";// the release (CHANGELOG.md); the footer offers an update when GitHub's newest release is newer
const VERSION="13.6";// older day-by-day rows loaded on demand ("older ›", an old date typed in the
// date box, a custom start before the newest ~400 days). `key` ties them to
// the table they came from (see dailyKey) so they are dropped when it changes.
const NO_OLDER={key:null,rows:[],busy:false,msg:null};const initialState={v:STATE_VERSION,raw:null,parseError:null,tick:0,rot:0,rotBase:0,hover:false,range:"1D",graphMode:"value",plMode:"cost",view:"list",mapRange:"1D",mapExpanded:false,sort:"az",pinnedPage:null,pinnedSection:null,focusTicker:null,showAdd:false,addForm:{ticker:"",shares:"",cost:"",date:""},addMsg:null,pendingAction:null,addMsgTip:null,addMsgTone:null,addMsgTick:0,// 13.5: hover text and amber tone of the form's line
demoSettled:false,// 13.5: a buy/import over the demo went through; data.json not caught up yet
justAdded:null,// 13.5: {ticker, seenTick, tick} — the row just bought, shaded briefly when it arrives
search:{query:"",results:[],busy:false,error:null},picked:null,lookTicker:null,// the stock this window last looked up (its data sits in lookBy, 12.12)
detailRange:"3M",detailMsg:null,mark:null,// pinned point: {t} from a graph click, or {t, v, d, approx, asked} for a picked day
// (sim: true = a simulated moment, before the first purchase)
hoverT:null,// time under the pointer on a graph
dayInput:"",dayMsg:null,dayPage:0,earnPage:0,sectorScale:"shared",from:null,// custom graph start {t, v?, approx?} — set with "from here"
sectorFocus:null,// the sector enlarged in the sectors view ("portfolio" = the whole)
sectorOrder:"best",// sector charts: best performer first, or "size" (biggest holding first)
graphBig:null,// the value / p&l graph enlarged (the ⤢ toggle); null = as saved (data.ui)
showBench:null,// the index line on the value graph; null = as saved (data.ui)
older:NO_OLDER,// older day rows loaded on demand
btMode:"held",// simulated part: today's share counts ("held") or today's weights ("weighted")
salesExpanded:false,// sales panel: the newest 5 sales, or all (up to 20)
incomeView:"bars",// income panel (13.6): "bars" (next 12 months) | "next" (next ex-dividend dates) | "years" (received per year)
pos:null,// where it was dragged {x, y}; false = back to the default spot; null = as saved (data.ui)
scale:null,// its size (the corner grip), 0.6–1.6; null = as saved (data.ui)
alertInput:"",alertMsg:null,alertBusy:false,// the "alert at…" box in a detail view (12.9)
alertMsgTick:0,// the data tick its message came at (the panel's fades 3 ticks later)
newsPref:null,// headlines on/off; null = as saved (data.ui.news)
alertsExpanded:false,// price alerts panel: the first 5 rules, or all
rebalWhole:null,// rebalance panel: whole shares (true) or fractional; null = as saved (data.ui), else auto (12.10)
rebalExpanded:false,// rebalance panel: the first 5 trades, or all
// the index under the graph (_settings.benchmark, 12.10). Read with defaults
// (benchWantOf, `|| ""`), so a 12.10 state saved before these existed is fine
benchWant:null,// "auto" | "none" | SYMBOL picked this session; null = as saved (data.ui.benchmark)
benchSaved:false,// set_setting.py saved benchWant (so data.json's ui carries it from now on)
benchPick:false,// the index picker is open
benchInput:"",// its "other symbol" box
benchMsg:null,// its message (a rejected symbol, a failed save)
compact:null,// one line (a title click, 12.11); null = as saved (data.ui.compact)
exportMsg:null,// the footer's export message {text, err, tick}
// windows (12.12): several framed boxes from one widget (_settings.display)
wins:{},// window id -> that window's own state (WIN_KEYS), created on first use
display:null,// this session's display (normDisplay); false = back to one plain window; null = as saved (data.ui.display)
geo:null,// {id, x, y, w, h, zoom} while a grip is dragged (live layout, no save yet)
front:null,// the window on top
lookBy:{},// ticker -> {data, busy, error}: full chart data per stock (was the one-slot `look`)
newsBy:{},// ticker -> {items, busy, error}: headlines per stock (was the one-slot `news`)
editOpen:false,editGroup:null,editConfirm:null,// the ⚙ editor (per window)
// 13.6: the target-mix editor's unsaved fields {vals: {"s:<sector>"|"t:<TICKER>"|"cash": text}, split: {<sector>: bool}}
tgtDraft:null,// (per window; 13.6: kept when ⚙ closes, dropped on save / start over / remove)
newsPage:0,// the news panel's page (per window)
newsQuery:null,newsQFrom:"",// the news page's live keyword (13.1; newsQFrom = the cfg.q it was typed over; not saved)
newsPickMsg:null,// the news page editor's "not a ticker: …" note (5 s)
// the ⚙ editor (13.2, shared by every window): the "arrange" switch (order,
// columns, priorities, moves), the hint lines, the note after a currency /
// history save {key, epoch, msg} (shown while data.json still carries that
// epoch) and a per-setting message {key: text} (an error, or a 5 s note)
editAdvanced:false,editHints:true,settingPending:null,editMsg:{},// 13.6: "undo" in ⚙ — the newest settings change {id, key, label, at, busy}
// (from a save's reply) and the note after an undo {text, err, at}
settingUndo:null,undoNote:null,// 13.4: the editor's search box (per window); the import panel of the +
// form {open, text, file, rows, ok, skipped, busy, msg} (shared); the
// update offer in the footer: its question open, "later" for a version,
// a message {text, err, tick}, "checking…" for the editor's check-now chip
editQuery:"",imp:null,updateAsk:false,updateLater:null,updateMsg:null,updateChecking:false,// 13.5: the background slider's live value while it is dragged (0.3-1), null
// = the saved one; shared (not in WIN_KEYS): every window previews it
opacityDraft:null,// 13.5: the setup / no-data card's message {text, err, tick} ("opening
// Terminal…", "copied…") and its "details" switch; shared, not in WIN_KEYS
setupMsg:null,errDetails:false,// 13.6: a note and a price target per stock (the detail view's note rows,
// holding_meta.py). Per window: which box is open ("note" | "target"),
// what is typed in it, a save under way, its message and the tick it came at
noteEdit:null,noteInput:"",noteBusy:false,noteMsg:null,noteMsgTick:0,// shared, not in WIN_KEYS: what the last save returned {tick, map: {TK: entry|null}},
// shown until data.json's "notes" catches up (NOTES_HOLD_TICKS)
notesLocal:null};// Per-window state: every window keeps its own copy of these (range, pinned
// point, view, open stock…); the rest of the state is shared by all windows.
exports.initialState=initialState;const WIN_KEYS=["range","graphMode","plMode","view","mapRange","mapExpanded","sort","pinnedPage","pinnedSection","focusTicker","lookTicker","showAdd","detailRange","detailMsg","mark","hoverT","dayInput","dayMsg","dayPage","earnPage","sectorScale","sectorOrder","from","sectorFocus","btMode","salesExpanded","incomeView","alertInput","alertMsg","alertBusy","alertMsgTick","alertsExpanded","rebalExpanded","benchPick","benchInput","benchMsg","rot","rotBase","hover","editOpen","editGroup","editConfirm","newsPage","newsQuery","newsQFrom","newsPickMsg","editQuery","tgtDraft","noteEdit","noteInput","noteBusy","noteMsg","noteMsgTick"];const WIN_INITIAL={};WIN_KEYS.forEach(k=>{WIN_INITIAL[k]=initialState[k];});const NO_SEARCH={query:"",results:[],busy:false,error:null};const IMPORT_EMPTY={open:true,text:"",file:null,rows:null,ok:0,skipped:0,busy:false,msg:null,demoReplace:true};const EMPTY_FORM={ticker:"",shares:"",cost:"",date:""};const merge=(prev,patch)=>Object.assign({},prev,patch);// Stale state starts over; the data on screen, the graph-size and one-line
// choices (plain booleans, safe in any version) and where the widget was
// dragged / how big it is (checked, so any shape is safe) carry over.
const sane=st=>st&&st.v===STATE_VERSION?st:Object.assign({},initialState,{raw:st&&st.raw?st.raw:null,graphBig:st&&typeof st.graphBig==="boolean"?st.graphBig:null,compact:st&&typeof st.compact==="boolean"?st.compact:null,pos:st&&st.pos===false?false:validPos(st&&st.pos),scale:validScale(st&&st.scale)});// Display choices saved in _settings (widget_command.sh setting; data.ui,
// 12.7+) so they survive a restart; a click this session wins until the
// next data.json carries it too.
const uiPrefs=st=>{const d=st&&st.raw&&st.raw.data;return d&&d.ui&&typeof d.ui==="object"?d.ui:{};};const graphBigOf=st=>typeof st.graphBig==="boolean"?st.graphBig:uiPrefs(st).graphBig===true;// one line (_settings.compact, 12.11): off unless saved or clicked on
const compactOf=st=>typeof st.compact==="boolean"?st.compact:uiPrefs(st).compact===true;const showBenchOf=st=>typeof st.showBench==="boolean"?st.showBench:uiPrefs(st).showBenchmark!==false;// headlines are opt-in (_settings.news, 12.9): off unless saved or clicked on
const newsOn=st=>typeof st.newsPref==="boolean"?st.newsPref:uiPrefs(st).news===true;// Target allocation (_settings.targets, 12.10): d.targets is null/absent without
// targets — then nothing on screen changes. `set` false = only warnings.
const targetsOn=d=>!!(d&&d.targets&&typeof d.targets==="object"&&d.targets.set===true);// whole shares or fractional: this session's click, else saved (ui.rebalanceWhole),
// else whole when every holding is a whole number of shares
const wholeOf=(st,d)=>{if(typeof st.rebalWhole==="boolean")return st.rebalWhole;const ui=d&&d.ui&&typeof d.ui==="object"?d.ui:{};if(typeof ui.rebalanceWhole==="boolean")return ui.rebalanceWhole;const ps=d&&Array.isArray(d.positions)?d.positions:[];return ps.every(p=>typeof p.shares!=="number"||Math.abs(p.shares-Math.round(p.shares))<1e-6);};const targetBuckets=d=>targetsOn(d)&&Array.isArray(d.targets.buckets)?d.targets.buckets.filter(b=>b&&typeof b.key==="string"):[];const bucketFor=(d,key)=>typeof key==="string"?targetBuckets(d).find(b=>b.key===key)||null:null;const bandOf=d=>d&&d.targets&&typeof d.targets.band==="number"&&isFinite(d.targets.band)?d.targets.band:1;// drift in percentage points: "+2.3", "−0.4", "0.0"
const fmtPts=v=>typeof v!=="number"||!isFinite(v)?"—":Math.abs(v)<0.05?"0.0":(v>0?"+":"−")+Math.abs(v).toFixed(Math.abs(v)>=99.95?0:1);const fmtTarget=v=>typeof v==="number"&&isFinite(v)?String(Math.round(v*100)/100)+"%":"—";// The target-mix editor (⚙ → Portfolio, 13.6). A typed % : "" = empty (null),
// "12", "12.5", "12,5 %" = a number, anything else or outside 0-100 = NaN
const tgtParse=text=>{const t=String(text===null||text===undefined?"":text);if(!t.trim())return null;const m=/^\s*(\d+(?:[.,]\d+)?)\s*%?\s*$/.exec(t);const n=m?Number(m[1].replace(",",".")):NaN;return isFinite(n)&&n>=0&&n<=100?n:NaN;};const plainObj=v=>!!v&&typeof v==="object"&&!Array.isArray(v);// the saved mix {name: pct}: data.json ui.targets; a 13.5 data.json (before the
// first 13.6 refresh) has only the explicit buckets
const savedTargets=d=>{const ui=d&&plainObj(d.ui)?d.ui:{};if(plainObj(ui.targets))return ui.targets;const out={};targetBuckets(d).forEach(b=>{if(b.implicit===false&&typeof b.targetPct==="number")out[b.key]=b.targetPct;});return out;};// the editor's rows: sectors (data.json themes order) with their holdings, cash, and the
// saved mix keyed "s:<sector>" | "t:<TICKER>" | "cash" (stale = names not held any more,
// nested = holdings whose sector has a % too: rebalance ignores their own %)
const tgtModel=(d,rawIn)=>{// rawIn: the mix just saved, until data.json carries it
const ps=d&&Array.isArray(d.positions)?d.positions:[];const sectors=(d&&Array.isArray(d.themes)?d.themes:[]).filter(t=>t&&typeof t.name==="string").map(t=>({name:t.name,nowPct:typeof t.weightPct==="number"?t.weightPct:0,tickers:ps.filter(p=>p&&p.theme===t.name&&typeof p.ticker==="string").map(p=>({ticker:p.ticker,nowPct:typeof p.weightPct==="number"?p.weightPct:0}))}));const tv=d&&d.totals&&typeof d.totals.value==="number"?d.totals.value:0;const cashNow=typeof(d&&d.cash)==="number"&&isFinite(d.cash)&&tv>0?d.cash/tv*100:0;const secOf={};sectors.forEach(s=>{secOf[s.name.toLowerCase()]=s.name;});const tkName={};sectors.forEach(s=>s.tickers.forEach(t=>{tkName[t.ticker.toUpperCase()]=t.ticker;}));const saved={},stale=[],split0={},nested=[];const raw=plainObj(rawIn)?rawIn:savedTargets(d);Object.keys(raw).forEach(k=>{const pct=Number(raw[k]);if(!isFinite(pct))return;const lk=String(k).trim().toLowerCase(),uk=String(k).trim().toUpperCase();const key=lk==="cash"?"cash":tkName[uk]?"t:"+tkName[uk]:secOf[lk]?"s:"+secOf[lk]:null;if(!key)stale.push([String(k),pct]);else if(!(key in saved))saved[key]=pct;// the first one counts
});sectors.forEach(s=>{const tks=s.tickers.filter(t=>"t:"+t.ticker in saved);if("s:"+s.name in saved)tks.forEach(t=>nested.push({ticker:t.ticker,sector:s.name}));else if(tks.length)split0[s.name]=true;});return{sectors:sectors,cashNow:cashNow,saved:saved,split0:split0,stale:stale,nested:nested,any:Object.keys(saved).length>0};};// a field's text: typed in the draft, else the saved %; a sector split by holding: the draft's choice, else split0
const tgtText=(model,draft,key)=>draft&&draft.vals&&typeof draft.vals[key]==="string"?draft.vals[key]:key in model.saved?String(model.saved[key]):"";const tgtSplitOf=(model,draft,name)=>draft&&draft.split&&typeof draft.split[name]==="boolean"?draft.split[name]:model.split0[name]===true;// what "save" would write: {sum, bad: [label], obj: {name: pct} (sectors with their holdings, then cash;
// empty fields left out), sums: {sector: % of its holdings}}
const tgtCollect=(model,draft)=>{let sum=0;const bad=[],obj={},sums={};const take=(key,name,label)=>{const n=tgtParse(tgtText(model,draft,key));if(n===null)return 0;if(isNaN(n)){bad.push(label);return 0;}obj[name]=n;sum+=n;return n;};model.sectors.forEach(s=>{if(tgtSplitOf(model,draft,s.name))sums[s.name]=s.tickers.reduce((a,t)=>a+take("t:"+t.ticker,t.ticker,t.ticker),0);else take("s:"+s.name,s.name,s.name);});take("cash","cash","cash");return{sum:sum,bad:bad,obj:obj,sums:sums};};// does the draft differ from the saved mix? (names not held any more and unused
// holding %s count as a change: saving leaves them out)
const tgtDirty=(model,draft)=>{if(!draft)return false;if(model.stale.length||model.nested.length)return true;return JSON.stringify(tgtCollect(model,draft).obj)!==JSON.stringify(tgtCollect(model,null).obj);};// "start from today's mix": each sector's and the cash's share now, whole %s that add up to exactly 100
const todaysMix=model=>{const items=model.sectors.map(s=>({key:"s:"+s.name,v:Math.max(0,s.nowPct||0)})).concat([{key:"cash",v:Math.max(0,model.cashNow||0)}]);const tot=items.reduce((a,it)=>a+it.v,0);const vals={};if(!(tot>0))return{vals:vals,split:{}};items.forEach(it=>{it.x=it.v/tot*100;it.n=Math.floor(it.x);});let left=100-items.reduce((a,it)=>a+it.n,0);items.slice().sort((a,b)=>b.x-b.n-(a.x-a.n)).forEach(it=>{if(left>0){it.n+=1;left-=1;}});items.forEach(it=>{if(!(it.key==="cash"&&it.n===0))vals[it.key]=String(it.n);});return{vals:vals,split:{}};};// Where the widget sits and how big it is (_settings.position / .scale via
// data.ui, 12.8): a drag this session wins, like the display choices above.
const SCALE_MIN=0.6,SCALE_MAX=1.6;const isNumber=v=>typeof v==="number"&&isFinite(v);function validPos(p){return p&&typeof p==="object"&&isNumber(p.x)&&isNumber(p.y)?{x:Math.round(p.x),y:Math.round(p.y)}:null;}function validScale(v){return isNumber(v)?Math.round(Math.max(SCALE_MIN,Math.min(SCALE_MAX,v))*100)/100:null;}// Until the first command output after a restart there is no data.ui: the
// last spot/size this viewer saw (localStorage, a per-viewer copy only;
// _settings stays the truth) keeps the widget from jumping once it arrives.
const FRAME_KEY="portfolio-widget.frame";let lastFrame;// cached JSON string of { pos, scale }
const readFrame=()=>{if(lastFrame===undefined){try{lastFrame=window.localStorage.getItem(FRAME_KEY)||"";}catch(e){lastFrame="";}}try{const f=JSON.parse(lastFrame);return f&&typeof f==="object"?f:{};}catch(e){return{};}};// (the first window's; w only when it isn't the default 664 — the 12.8 format otherwise)
const rememberFrame=(pos,s,w)=>{const v=JSON.stringify(isNumber(w)&&w!==WIDGET_W?{pos:pos||null,scale:s,w:w}:{pos:pos||null,scale:s});if(v===lastFrame)return;lastFrame=v;try{window.localStorage.setItem(FRAME_KEY,v);}catch(e){/* private window, blocked storage: fine */}};const hasData=st=>!!(st&&st.raw&&st.raw.data);const posOf=st=>st.pos===false?null:validPos(st.pos)||validPos(hasData(st)?uiPrefs(st).position:readFrame().pos);const scaleOf=st=>validScale(st.scale)||validScale(hasData(st)?uiPrefs(st).scale:readFrame().scale)||1;// ------------------------------------------------------------------ layout constants (12.12)
// Every size the layout engine (layoutFor, below the sections) works with, in
// unscaled px. Heights are on the generous side: an overestimate only leaves
// spare room. The 12.11 window (664 wide, auto height) gets 12.11's numbers
// exactly: content 630, graph 628 × 104 (240 big), columns 300.5, map 340 × 420,
// expanded map 632 × 640, price chart 300, caption 470, eyebrow 170, rows 12/24/10.
const LAYOUT_K={PAD_X:34,BASE_CW:630,GUTTER:29,COL2:549,COL3:958,MAP_FLEX:1.35,BASE_GRAPH_W:628,GRAPH_H:104,GRAPH_H_BIG:240,G_MIN:0.75,G_MAX:1.5,GRAPH_STEP:8,GRAPH_MIN:64,GRAPH_MIN_F:0.6,GRAPH_MAX_F:0.5,GRAPH_MAX:480,SECTOR_FACET:157,SECTOR_GAP:14,SECTOR_H:48,SECTOR_ROW:64,SECTOR_ROWGAP:9,SECTOR_MAXCOLS:6,MAP_H:420,MAP_MIN:160,MAP_STEP:20,MAP_BIG_H:640,MAP_INSET:5,CAPTION_OFF:158,EYEBROW_OFF:130,PRICE_W:300,PRICE_H:118,SPARK:54,ROWS:{holdings:12,earnings:24,days:10,news:6},ROWS_MIN:{holdings:4,earnings:4,days:4,news:3},ROWS_MAX:{holdings:40,earnings:60,days:30,news:1000},CELL:{ticker:52,spark:54,vol:16,drift:30,day:44,value:52,pl:48,price:52},CELL_DROP:["spark30","spark","price","value","vol","drift","pl"],SPARK_MID:30,UNDATED_GAP:3,WATCH:{ticker:60,name:6,spark:54,vol:16,day:44,price:54,x:10},WATCH_DROP:["spark30","spark","vol"],MONO:0.62,TAB_PAD:14,TAB_PAD_TIGHT:8,TAB_BIG:20,TAB_RESERVE:80,DATE_BOX:82,SEP:16,CHROME:38,GAP:19,HDR1:29,HDRN:13,TABS:16,READOUT:15,GRAPH_MT:4,AXIS:12,NOTES:11,CAPTION:11,SIMCAP:11,EYEBROW:13,ROW_HOLD:16,ROW_EARN:15,ROW_DAY:15,ROW_NEWS:27,ROW_NEWS_DENSE:14,ROW_NEWS_GROUP:14,NEWS_FILTER:18,NEWS_STATUS:11,ROW_ALERT:13,ROW_LINE:13,DOTS:17,PAGER:16,LEGEND:12,FOOTER:11,LOADING:18,HINT:14,MINI:36,ADD_FORM:124,STAT:16,BENCH_PICK:180,COMPACT_SPARK:90,WELCOME:78,IMPORT:118,// panel estimates (est.* in renderWin): fixed parts and one row each
DETAIL:262,DETAIL_X:58,EMPTY_MSG:44,MAPTABS:16,MOVER_ROW:14,TODAY_FIX:30,THEME_ROW:18,RISK_ROW:13,RISK_FIX:62,INCOME:64,INCOME_TABS:14,INCOME_BARS:40,INCOME_ROW:12,REBAL_FIX:28,SALE_ROW:14,RULE_ROW:15,MORE:14,WATCH_ROW:16,CUR_ROW:14,CUR_FIX:30,// 13.6: the currencies panel: one currency row, and its two summary lines
THEME_MIN:272,COL_BASE:300,EYE_CH:7.2,CHIP_PAD:14,CHIP_TIGHT:8,TAB_SEP:17,COL_GAP:8,NARROW:400,TAB_READOUT:100,SLIVER_W:30,SLIVER_H:16,NOTE_ROWS:32,NOTE_EDIT:20,// 13.6: a detail view's price target + note rows (2 × STAT) and their open box
UNDO_CHIP:150,UNDO_FULL_W:420,// 13.6: the ⚙ undo chip's max width; narrower content shows just "undo"
GOAL_BAR:46// 13.6: the goal line's progress bar (40 px) and its margin
};const WIDGET_W=LAYOUT_K.BASE_CW+LAYOUT_K.PAD_X;// 664: a window's default width
// ------------------------------------------------------------------ windows (12.12)
// The widget can show several WINDOWS (_settings.display.windows, via data.ui):
// each its own framed box with its own spot, size, zoom, title, features and
// per-window state (WIN_KEYS). Without _settings.display there is exactly one
// window, "main", which is 12.11's widget (position/scale/compact/graphBig).
//
// Every feature a window can show (kind: head = header line, block, part =
// on/off sub-feature, panel, cell = holding-row cell; p = default priority;
// side a/b = left/right column; car = in the left-side boxes (the carousel); full: false = not
// in the full template, i.e. not in 12.11's look).
const FEATURES=[{id:"header.value",label:"total value",tip:"what everything you own is worth right now",kind:"head",p:"always"},{id:"header.day",label:"today's change",tip:"how much the portfolio moved today",kind:"head",p:"always"},{id:"header.fx",label:"price and currency moves",tip:"today's price move and the currency move, side by side",kind:"head",p:"room"},{id:"header.pl",label:"profit / loss",tip:"click it to see it against what you invested",kind:"head",p:"normal"},{id:"header.div",label:"dividends per year",tip:"the dividends you can expect in a year",kind:"head",p:"room"},{id:"header.realized",label:"realized gains",tip:"profit or loss from what you have already sold",kind:"head",p:"room"},{id:"header.totalReturn",label:"total return",tip:"profit plus dividends, against what you invested",kind:"head",p:"room"},{id:"header.annual",label:"annual return",tip:"the yearly return, on average",kind:"head",p:"room"},{id:"header.goal",label:"goal",tip:"how close you are to the goal set in ⚙ → Portfolio → a goal to reach",kind:"head",p:"normal"},{id:"graph",label:"graph",tip:"the value graph",kind:"block",p:"normal"},{id:"graph.tabs",label:"time range buttons",tip:"the 1D · 1W · 1M … buttons that set the graph's time range",kind:"part",parent:"graph",p:"normal"},{id:"graph.range.1H",label:"1H",tip:"the last hour",kind:"part",parent:"graph.tabs"},{id:"graph.range.1D",label:"1D",tip:"today",kind:"part",parent:"graph.tabs"},{id:"graph.range.1W",label:"1W",tip:"the last week",kind:"part",parent:"graph.tabs"},{id:"graph.range.1M",label:"1M",tip:"the last month",kind:"part",parent:"graph.tabs"},{id:"graph.range.1Y",label:"1Y",tip:"the last year",kind:"part",parent:"graph.tabs"},{id:"graph.range.3Y",label:"3Y",tip:"the last 3 years",kind:"part",parent:"graph.tabs"},{id:"graph.range.5Y",label:"5Y",tip:"the last 5 years",kind:"part",parent:"graph.tabs"},{id:"graph.range.10Y",label:"10Y",tip:"the last 10 years",kind:"part",parent:"graph.tabs"},{id:"graph.range.MAX",label:"MAX",tip:"as far back as the history goes",kind:"part",parent:"graph.tabs"},{id:"graph.range.ALL",label:"ALL",tip:"since your first purchase",kind:"part",parent:"graph.tabs"},{id:"graph.modes",label:"value / profit / sectors buttons",tip:"switch the graph between value, profit and sectors",kind:"part",parent:"graph.tabs"},{id:"graph.mode.value",label:"value",tip:"the graph shows what the portfolio is worth",kind:"part",parent:"graph.modes"},{id:"graph.mode.pl",label:"p&l",tip:"the graph shows profit or loss",kind:"part",parent:"graph.modes"},{id:"graph.mode.sectors",label:"sectors",tip:"the graph shows each sector",kind:"part",parent:"graph.modes"},{id:"graph.date",label:"jump to a date",tip:"type a date to jump the graph there (hidden in windows narrower than 400 px)",kind:"part",parent:"graph.tabs"},{id:"graph.readout",label:"value under the mouse",tip:"the value at the point under the mouse",kind:"part",parent:"graph.tabs"},{id:"graph.big",label:"bigger-graph button (⤢)",tip:"the button that makes the graph taller",kind:"part",parent:"graph.tabs"},{id:"graph.bench",label:"index line",tip:"a thin grey line for the index you compare with",kind:"part",parent:"graph",p:"room"},{id:"graph.benchPicker",label:"index chooser",tip:"the link that lets you pick another index",kind:"part",parent:"graph.bench"},{id:"graph.backtest",label:"'what if you had bought earlier'",tip:"what the portfolio would have done if bought earlier",kind:"part",parent:"graph",p:"room"},{id:"graph.late",label:"note for newer holdings",tip:"a note when a holding is newer than the graph's start",kind:"part",parent:"graph",p:"room"},{id:"graph.notes",label:"notes under the graph",tip:"small notes under the graph (data gaps, loading)",kind:"part",parent:"graph",p:"room"},{id:"panel.today",label:"today's biggest movers",tip:"today's biggest risers and fallers",kind:"panel",p:"normal",side:"a",car:true},{id:"panel.sectors",label:"sectors",tip:"how much sits in each sector",kind:"panel",p:"normal",side:"a",car:true},{id:"panel.risk",label:"risk numbers",tip:"how risky the mix is (swings, concentration)",kind:"panel",p:"normal",side:"a",car:true},{id:"panel.days",label:"day-by-day results",tip:"one line per day: value and change",kind:"panel",p:"room",side:"a",car:true},{id:"panel.holdings",label:"holdings",tip:"the list of everything you own; click one for its detail",kind:"panel",p:"normal",side:"a"},{id:"holdings.list",label:"list",tip:"the plain list of holdings",kind:"part",parent:"panel.holdings"},{id:"holdings.map",label:"heat map",tip:"a map of boxes sized by value, coloured by change",kind:"part",parent:"panel.holdings"},{id:"holdings.watch",label:"watchlist",tip:"stocks you follow but don't own",kind:"part",parent:"panel.holdings"},{id:"holdings.add",label:"buy / sell button",tip:"the button that records a purchase or a sale",kind:"part",parent:"panel.holdings"},{id:"holdings.sort",label:"sort buttons",tip:"the buttons that sort the list",kind:"part",parent:"panel.holdings"},{id:"holdings.pages",label:"page dots",tip:"the dots that page a long list",kind:"part",parent:"panel.holdings"},{id:"map.drift",label:"heat map: colour by off-target",tip:"colour the map by how far each holding is from its target",kind:"part",parent:"holdings.map"},{id:"detail.alerts",label:"stock detail: price alert box",tip:"the price-level box in a stock's detail view",kind:"part",parent:"panel.holdings"},{id:"detail.news",label:"stock detail: headlines",tip:"headlines in a stock's detail view",kind:"part",parent:"panel.holdings"},{id:"detail.target",label:"stock detail: target line",tip:"the target share line in a stock's detail view",kind:"part",parent:"panel.holdings"},{id:"panel.earnings",label:"earnings dates",tip:"when each company reports next",kind:"panel",p:"normal",side:"b"},{id:"panel.sales",label:"sales and realized gains",tip:"what you sold and the profit on it",kind:"panel",p:"room",side:"b"},{id:"panel.income",label:"dividend income",tip:"dividends received and expected",kind:"panel",p:"room",side:"b"},{id:"panel.currencies",label:"currencies",tip:"how much sits in each currency, and what currency moves did today and since you bought",kind:"panel",p:"room",side:"b"},{id:"panel.rebalance",label:"rebalancing",tip:"what to buy or sell to get back to your targets",kind:"panel",p:"normal",side:"b"},{id:"panel.priceAlerts",label:"your price alerts",tip:"price levels you set yourself — works without big-move alerts",kind:"panel",p:"normal",side:"b"},{id:"panel.alerts",label:"big moves this week",tip:"the week's big moves — needs Portfolio → big-move alerts on",kind:"panel",p:"normal",side:"b"},{id:"panel.news",label:"news",tip:"headlines for your holdings",kind:"panel",p:"normal",side:"b",full:false},{id:"row.spark",label:"tiny price graph",tip:"a small graph of the last days' prices",kind:"cell"},{id:"row.vol",label:"how jumpy (volatility)",tip:"how much the price swings",kind:"cell"},{id:"row.drift",label:"off-target badge",tip:"how far the holding is from its target share",kind:"cell"},{id:"row.day",label:"today's %",tip:"today's move in percent",kind:"cell"},{id:"row.value",label:"value",tip:"what the holding is worth",kind:"cell"},{id:"row.pl",label:"profit %",tip:"profit or loss in percent",kind:"cell"},{id:"row.bell",label:"alert bell",tip:"a bell when a price alert is set on it",kind:"cell"},{id:"row.news",label:"news dot",tip:"a dot when there are fresh headlines",kind:"cell"},{id:"row.price",label:"price in its own currency",tip:"the price in the stock's own currency",kind:"cell",full:false},{id:"footer",label:"bottom row",tip:"the dim row at the bottom",kind:"block",p:"room"},{id:"footer.stats",label:"small print (costs, saved data)",tip:"estimated data costs and how much history is saved",kind:"part",parent:"footer"},{id:"footer.updated",label:"'updated … ago'",tip:"when the data was last updated",kind:"part",parent:"footer"},{id:"footer.export",label:"export link",tip:"a link that exports the holdings to a file",kind:"part",parent:"footer"}];const FEATURE_BY={};FEATURES.forEach(f=>{FEATURE_BY[f.id]=f;});const FULL_ITEMS=FEATURES.filter(f=>f.full!==false).map(f=>f.id);// 12.11's look, in order
// id is `root` or sits under it (a part of a part of it…)
const isUnder=(id,root)=>{for(let f=FEATURE_BY[id];f;f=FEATURE_BY[f.parent])if(f.id===root)return true;return id===root;};const pickItems=roots=>FULL_ITEMS.filter(id=>roots.some(r=>isUnder(id,r)));const HEAD2=["header.value","header.day"];// "+ new window" starts from one of these (x/y: placeNear)
const TEMPLATES=[{key:"full",label:"full",desc:"everything, like the classic widget",w:WIDGET_W,h:"auto"},{key:"graph",label:"graph only",desc:"just the graph with the totals above",items:pickItems(HEAD2.concat(["graph"])),w:WIDGET_W,h:260},{key:"holdings",label:"holdings",desc:"the holdings list on its own",w:380,h:"auto",items:pickItems(HEAD2.concat(["panel.holdings"],FULL_ITEMS.filter(id=>FEATURE_BY[id].kind==="cell")))},{key:"news",label:"news & alerts",desc:"headlines and alerts, nothing else",items:HEAD2.concat(["panel.news","panel.priceAlerts","panel.alerts"]),w:360,h:420,news:true,tip:"today's movers' headlines, price alerts and alerts"},{key:"newspage",label:"news page",desc:"a tall page of headlines",items:HEAD2.concat(["panel.news"]),w:480,h:560,news:true,newsCfg:{scope:"all",per:5,sort:"new",span:"week",market:["cnbc","marketwatch","ft"]},tip:"this week's headlines for every holding and the watchlist, plus CNBC, MarketWatch and FT — turns headlines on"},{key:"ticker",label:"ticker line",desc:"a small one-line ticker for the corner of the screen",items:HEAD2.slice(),compact:true,w:420},{key:"blank",label:"blank",desc:"an empty window — tick what it shows",items:[],w:360,h:200}];// _settings.display, checked like display_prefs.clean_display (lenient: a bad
// field is dropped, numbers clamped). Unknown feature ids stay in `items` (a
// newer version's features survive a save) and are ignored where used.
const WIN_ID_RE=/^[a-z][a-z0-9]{0,11}$/;const FEATURE_ID_RE=/^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)*$/;const WIN_W_MIN=300,WIN_W_MAX=1400,WIN_H_MIN=160,WIN_H_MAX=2000,MAX_WINDOWS=8;const WIN_FIELDS=["id","title","x","y","w","h","zoom","items","prio","side","carousel","compact","graphBig","news"];const clampInt=(v,lo,hi)=>Math.max(lo,Math.min(hi,Math.round(v)));// titles as display_prefs counts them: code points, no control/C1 chars, no
// U+2028/2029, no lone surrogates
const TITLE_BAD_CH=/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;const lone=c=>c.length===1&&c>="\ud800"&&c<="\udfff";const titleOk=t=>{const cs=Array.from(t);return cs.length>=1&&cs.length<=40&&!cs.some(lone)&&!new RegExp(TITLE_BAD_CH.source).test(t);};// The news page's options (13.1, windows[i].news; display_prefs.py mirrors
// them): absent = the 13.0 news panel, present (even {}) = the news page.
// Default-valued fields are dropped inside, the object itself is kept.
const NEWS_TICKER_RE=/^\^?[A-Z0-9][A-Z0-9.\-=&]{0,19}$/;const NEWS_SCOPES=["movers","holdings","watch","all","pick"];const NEWS_SORTS=["new","move","ticker"];const NEWS_SPANS=["day","3d","week","all"];const NEWS_LIST_MAX=40,NEWS_Q_MAX=60,NEWS_DENSE_TAGS=3;// dense rows show 3 tags + "+n"
const NEWS_DEF={market:[],scope:"movers",tickers:[],per:3,sort:"move",span:"all",group:false,dense:false,sources:true,mute:[],q:""};// control, format (soft hyphen, zero-width, bidi, BOM…) and private-use code points
const NEWS_Q_BAD=/[\u0000-\u001f\u007f-\u009f\u00ad\u0600-\u0605\u061c\u06dd\u070f\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb\ue000-\uf8ff]|\ud804[\udcbd\udccd]|\ud80d[\udc30-\udc3f]|\ud82f[\udca0-\udca3]|\ud834[\udd73-\udd7a]|\udb40[\udc01\udc20-\udc7f]|[\udb80-\udbff][\udc00-\udfff]/;const newsQOk=q=>{const cs=Array.from(q);return cs.length<=NEWS_Q_MAX&&!cs.some(lone)&&!NEWS_Q_BAD.test(q);};// a ticker list: upper-cased, TICKER_RE, deduped, order kept, at most 40 (null = not a list)
const newsList=v=>{if(!Array.isArray(v))return null;const out=[],seen={};v.forEach(t=>{const x=typeof t==="string"?t.trim().toUpperCase():"";if(x&&NEWS_TICKER_RE.test(x)&&!seen[x]&&out.length<NEWS_LIST_MAX){seen[x]=true;out.push(x);}});return out;};// lenient like display_prefs.clean_display: a bad field is dropped, the rest
// kept; null when `news` is not an object (then it is dropped)
// market headlines (13.3): the tracker's NEWS_FEEDS, cached under "@<id>"
const NEWS_FEEDS={cnbc:"CNBC",marketwatch:"MarketWatch",yahoo:"Yahoo Finance",ft:"FT"};// 13.6: the words the ⚙ search finds each news option by (newsEditorNode's row keys)
const NEWS_OPT_WORDS={scope:"whose movers holdings watchlist both pick",pick:"tickers pick",picked:"picked tickers",per:"per stock headlines how many",sort:"order sort newest movers a-z",span:"since today 3 days week age",layout:"layout dense group by ticker source time",market:"market news feed "+Object.values(NEWS_FEEDS).join(" "),mute:"muted mute unmute",q:"keyword filter"};const NEWS_FEED_IDS=Object.keys(NEWS_FEEDS);const isFeedKey=tk=>typeof tk==="string"&&tk.charAt(0)==="@";const newsTagText=tk=>isFeedKey(tk)?NEWS_FEEDS[tk.slice(1)]||tk.slice(1):tk;const NEWS_STALE_S=7*86400;// the movers panel (no options) hides older headlines
const normNews=v=>{if(!v||typeof v!=="object"||Array.isArray(v))return null;const o={};if(NEWS_SCOPES.indexOf(v.scope)>=0&&v.scope!==NEWS_DEF.scope)o.scope=v.scope;const tk=newsList(v.tickers);if(tk&&tk.length)o.tickers=tk;if(isNumber(v.per)&&Math.round(v.per)===v.per&&v.per>=1&&v.per<=10&&v.per!==NEWS_DEF.per)o.per=v.per;if(NEWS_SORTS.indexOf(v.sort)>=0&&v.sort!==NEWS_DEF.sort)o.sort=v.sort;if(NEWS_SPANS.indexOf(v.span)>=0&&v.span!==NEWS_DEF.span)o.span=v.span;if(v.group===true)o.group=true;if(v.dense===true)o.dense=true;if(v.sources===false)o.sources=false;const mu=newsList(v.mute);if(mu&&mu.length)o.mute=mu;if(typeof v.q==="string"&&v.q&&newsQOk(v.q))o.q=v.q;const mk=Array.isArray(v.market)?v.market.filter((x,i,a)=>NEWS_FEED_IDS.indexOf(x)>=0&&a.indexOf(x)===i):null;if(mk&&mk.length)o.market=mk;return o;};// the options with the defaults filled in; null = the 13.0 path (no `news`)
const newsCfgOf=win=>{const n=win&&win.news?normNews(win.news):null;return n?Object.assign({},NEWS_DEF,n):null;};const cleanMap=(m,ok,cap)=>{if(!m||typeof m!=="object"||Array.isArray(m))return null;const out={};let n=0;Object.keys(m).forEach(k=>{if(n<cap&&k.length<=40&&FEATURE_ID_RE.test(k)&&ok.indexOf(m[k])>=0){out[k]=m[k];n++;}});return n?out:null;};const normWindow=w=>{if(!w||typeof w!=="object"||Array.isArray(w)||typeof w.id!=="string"||!WIN_ID_RE.test(w.id))return null;const o={id:w.id};if(typeof w.title==="string"){const t=w.title.trim();if(titleOk(t))o.title=t;}if(isNumber(w.x)&&isNumber(w.y)){o.x=clampInt(w.x,-10000,20000);o.y=clampInt(w.y,0,20000);}if(isNumber(w.w))o.w=clampInt(w.w,WIN_W_MIN,WIN_W_MAX);if(w.h==="auto")o.h="auto";else if(isNumber(w.h))o.h=clampInt(w.h,WIN_H_MIN,WIN_H_MAX);if(isNumber(w.zoom))o.zoom=Math.round(Math.max(SCALE_MIN,Math.min(SCALE_MAX,w.zoom))*100)/100;if(Array.isArray(w.items)){const seen={};o.items=w.items.filter(id=>typeof id==="string"&&id.length<=40&&FEATURE_ID_RE.test(id)&&!seen[id]&&(seen[id]=true)).slice(0,200);}const prio=cleanMap(w.prio,["always","normal","room"],200);if(prio)o.prio=prio;const side=cleanMap(w.side,["a","b"],60);if(side)o.side=side;if(w.carousel==="rotate"||w.carousel==="stack")o.carousel=w.carousel;if(typeof w.compact==="boolean")o.compact=w.compact;if(typeof w.graphBig==="boolean")o.graphBig=w.graphBig;const nw=normNews(w.news);if(nw)o.news=nw;return o;};const normDisplay=obj=>{if(!obj||typeof obj!=="object"||!Array.isArray(obj.windows))return null;const out=[],ids={};obj.windows.forEach(w=>{const o=out.length<MAX_WINDOWS?normWindow(w):null;if(o&&!ids[o.id]){ids[o.id]=true;out.push(o);}});return out.length?{windows:out}:null;};// what is saved: defaults left out (items too when they are the full set, in order)
const compactWindow=w=>{const o={};WIN_FIELDS.forEach(k=>{const v=w[k];if(v===undefined||v===null)return;if(k==="w"&&v===WIDGET_W||k==="h"&&v==="auto"||k==="zoom"&&v===1||k==="carousel"&&v==="rotate"||(k==="compact"||k==="graphBig")&&v===false)return;if(k==="items"&&v.length===FULL_ITEMS.length&&v.every((id,i)=>id===FULL_ITEMS[i]))return;if((k==="prio"||k==="side")&&!Object.keys(v).length)return;if(k==="news"){const nw=normNews(v);if(nw)o.news=nw;return;}o[k]=v;});return o;};const compactDisplay=disp=>({windows:disp.windows.map(compactWindow)});let normMemo={src:undefined,out:null};const savedDisplay=st=>{const src=hasData(st)?uiPrefs(st).display:null;if(src!==normMemo.src)normMemo={src:src,out:normDisplay(src)};return normMemo.out;};// this session's display (false: back to one plain window), else data.ui.display; null = legacy
const displayOf=st=>st.display===false?null:st.display||savedDisplay(st);// the one 12.11 window (no _settings.display): spot, zoom and one-line from the legacy keys
const legacyWindow=st=>{const w=hasData(st)?null:readFrame().w;return Object.assign({id:"main",legacy:true,compact:compactOf(st),graphBig:graphBigOf(st)},isNumber(w)?{w:clampInt(w,WIN_W_MIN,WIN_W_MAX)}:{});};const windowsOf=(st,disp)=>{const dsp=disp===undefined?displayOf(st):disp;return dsp?dsp.windows:[legacyWindow(st)];};// the first display from the legacy keys (any change beyond move / one line / ⤢)
const migrateDisplay=st=>{const w={id:"main"};const p=posOf(st),s=scaleOf(st);if(p){w.x=p.x;w.y=p.y;}if(s!==1)w.zoom=s;if(compactOf(st))w.compact=true;if(graphBigOf(st))w.graphBig=true;return{windows:[w]};};// a window's features: its items (in order), else the full set
const itemsOf=win=>win&&Array.isArray(win.items)?win.items:FULL_ITEMS;const itemSets=typeof WeakMap==="function"?new WeakMap():null;const itemSetOf=items=>{let set=itemSets?itemSets.get(items):null;if(!set){set={};items.forEach(id=>{set[id]=true;});if(itemSets)itemSets.set(items,set);}return set;};// shown: the id and every one of its parents are switched on
const enabled=(win,id)=>{const set=itemSetOf(itemsOf(win));if(!set[id])return false;for(let f=FEATURE_BY[id];f&&f.parent;f=FEATURE_BY[f.parent])if(!set[f.parent])return false;return true;};// a copy of `disp` with window `id` changed (a field set to undefined is removed)
const patchWin=(disp,id,patch)=>({windows:disp.windows.map(w=>{if(w.id!==id)return w;const o=Object.assign({},w,patch);Object.keys(o).forEach(k=>{if(o[k]===undefined)delete o[k];});return o;})});// Saving: the screen follows at once (SET_DISPLAY), the file 300 ms after the
// last change, one save at a time, the latest wins (a slider or a drag never
// saves per step). setting display (set_setting.py) patches data.ui in place.
// One queue for every `setting` save (13.2): two set_setting.py runs at the
// same moment each load and rewrite positions.json / data.json and one would
// undo the other's change, so each run starts after the previous one answered.
let settingChain=Promise.resolve();const runQueued=args=>{const p=settingChain.then(()=>(0,_uebersicht.run)(helper(args)));settingChain=p.then(()=>null,()=>null);return p;};// 13.6: a saved setting's reply carries "undo" {id, key, label, t} (the newest
// record of the undo stack): it becomes the ⚙ chip. Never throws.
const offerUndo=(out,dispatch)=>{try{const r=parseJson(String(out).trim());if(r&&r.ok&&r.undo&&dispatch)dispatch({type:"UNDO_OFFER",undo:r.undo,at:Date.now()});}catch(e){/* no chip */}};// the chip's record while it is fresh (UNDO_SHOW_MS), else null
const undoFresh=(u,now)=>u&&typeof u.at==="number"&&now-u.at<UNDO_SHOW_MS?u:null;// a portfolio setting from the ⚙ editor: the reply's ui value goes into
// data.ui at once (UI_PATCH), an error shows under the row (EDIT_MSG)
const saveSetting=(key,value,dispatch)=>runQueued(["setting",key,String(value)]).then(out=>{const r=parseJson(String(out).trim());if(!r||r.error){dispatch({type:"EDIT_MSG",key:key,msg:r&&r.error||"could not save "+key});return r||{error:"could not save "+key};}dispatch({type:"EDIT_MSG",key:key,msg:null});if(r.ok&&r.key===key&&"value"in r)dispatch({type:"UI_PATCH",key:key,value:r.value});offerUndo(out,dispatch);return r;},()=>{dispatch({type:"EDIT_MSG",key:key,msg:"could not save "+key});return{error:"could not save "+key};});const DISPLAY_SAVE_MS=300;const UNDO_SHOW_MS=180000;// 13.6: the ⚙ "undo" chip shows for 3 min after a change
const UNDO_NOTE_MS=8000;// ... and the note after an undo for 8 s
const DISPLAY_SAVE_STUCK_MS=15000;// a save that never answers stops blocking the next one
const dispSave={timer:null,want:null,busy:0,dispatch:null};// dispatch: for the reply's undo offer (13.6)
const flushDisplay=()=>{dispSave.timer=null;if(dispSave.busy&&Date.now()-dispSave.busy<DISPLAY_SAVE_STUCK_MS||dispSave.want===null)return;const arg=dispSave.want;dispSave.want=null;const mine=dispSave.busy=Date.now();const done=()=>{if(dispSave.busy!==mine)return;dispSave.busy=0;if(dispSave.want!==null&&!dispSave.timer)flushDisplay();};runQueued(["setting","display",arg]).then(out=>{offerUndo(out,dispSave.dispatch);done();},done);};const saveDisplay=(disp,dispatch)=>{dispatch({type:"SET_DISPLAY",display:disp});dispSave.dispatch=dispatch;dispSave.want=disp?JSON.stringify(compactDisplay(disp)):"default";if(dispSave.timer)clearTimeout(dispSave.timer);dispSave.timer=setTimeout(flushDisplay,DISPLAY_SAVE_MS);};// "reset all windows" (the ⚙ editor, This window): ONE run of `setting display reset-all`,
// which also drops position, scale, graphBig, showBenchmark and compact. It
// replaces a display save still waiting and waits for one that is running.
const resetAllDisplay=dispatch=>{dispatch({type:"RESET_LOOK"});dispSave.dispatch=dispatch;dispSave.want="reset-all";if(dispSave.timer)clearTimeout(dispSave.timer);flushDisplay();};// 13.6: the ⚙ "undo" chip: `setting undo ID` puts the newest change back
// (only if it still is ID). A display save still waiting goes first (the
// queue keeps the order), so the undo never lands before it.
const undoSetting=(state,dispatch)=>{const u=undoFresh(state.settingUndo||null,Date.now());if(!u||u.busy)return;if(dispSave.timer){clearTimeout(dispSave.timer);flushDisplay();}dispatch({type:"UNDO_BUSY",on:true});const fail=()=>{dispatch({type:"UNDO_NOTE",text:"could not undo",err:true,at:Date.now()});dispatch({type:"UNDO_BUSY",on:false});};runQueued(["setting","undo",String(u.id)]).then(out=>{const r=parseJson(String(out).trim());const at=Date.now();if(r&&r.ok){if(r.ui&&typeof r.ui==="object"&&"targets"in r.ui){tgtSent.obj=null;tgtSent.epoch=null;}dispatch({type:"UNDO_APPLIED",ui:r.ui||{},next:r.next||null,at:at});dispatch({type:"UNDO_NOTE",text:"put back: "+(r.undone&&r.undone.label||"the last change"),err:false,at:at});}else if(r&&r.error){dispatch({type:"UNDO_NOTE",text:r.error,err:true,at:at});dispatch({type:"UNDO_OFFER",undo:r.next||null,at:at});// the next record replaces the busy one (or none)
}else fail();},fail);};// change one window (migrating from the legacy keys first when there is no display yet)
const changeWin=(st,id,patch,dispatch)=>saveDisplay(patchWin(displayOf(st)||migrateDisplay(st),id,patch),dispatch);// per-stock data kept for every window (at most KEEP_STOCKS stocks; the oldest go)
const KEEP_STOCKS=6;const keepSome=(map,key,val)=>{const out={};const keys=Object.keys(map||{}).filter(k=>k!==key);keys.slice(Math.max(0,keys.length-(KEEP_STOCKS-1))).forEach(k=>{out[k]=map[k];});out[key]=val;return out;};const lookOf=(st,tk)=>{const e=tk&&st.lookBy?st.lookBy[tk]:null;return e?{ticker:tk,data:e.data||null,busy:!!e.busy,error:e.error||null}:{ticker:tk||null,data:null,busy:false,error:null};};const newsOf=(st,tk)=>{const e=tk&&st.newsBy?st.newsBy[tk]:null;return e?{ticker:tk,items:Array.isArray(e.items)?e.items:[],busy:!!e.busy,error:e.error||null}:null;};// Identifies the day-by-day table the loaded older rows belong to: a new day,
// a longer history (dailyFirst moves back) or a rebuilt table changes it.
const dailyKey=d=>{if(!d)return"";const daily=Array.isArray(d.daily)?d.daily:[];return(d.dailyFirst||"")+"|"+(d.dailyTotal||0)+"|"+(daily.length&&daily[0]?daily[0][0]:"");};// 13.6: an "undo" record from set_setting.py's reply ({id, key, label, t}),
// checked; anything else is null (no chip)
const undoRec=(u,at)=>u&&typeof u==="object"&&typeof u.id==="number"&&isFinite(u.id)&&typeof u.key==="string"?{id:Number(u.id),key:String(u.key),label:String(u.label||u.key).slice(0,80),at:at,busy:false}:null;// a saved key -> this session's mirror of it; null there = "as saved" (data.ui)
// for each reader (graphBigOf, showBenchOf, compactOf, newsOn, wholeOf,
// benchWantOf, posOf, scaleOf, the opacity slider)
const UNDO_MIRRORS=[["position","pos"],["scale","scale"],["graphBig","graphBig"],["showBenchmark","showBench"],["compact","compact"],["news","newsPref"],["rebalanceWhole","rebalWhole"],["benchmark","benchWant"],["opacity","opacityDraft"]];// every case below sees ONE window's view of the state (the shared keys plus
// that window's WIN_KEYS; see updateState) and never needs to know which window
const coreReducer=(event,prev)=>{switch(event.type){case"UB/COMMAND_RAN":{let parsed=prev.raw;let parseError=null;try{parsed=JSON.parse(event.output);}catch(e){parseError=String(event.output||event.error||"command produced no output").slice(0,400);}// older rows from another version of the table are dropped
const older=prev.older.key!==null&&parsed&&parsed.data&&dailyKey(parsed.data)!==prev.older.key?NO_OLDER:prev.older;// pages/sections only rotate while the pointer is NOT over the widget
// a message under the alerts panel (no stock open) goes after ~15 s
const fade=prev.alertMsg&&!prev.alertBusy&&!prev.focusTicker&&!(prev.tick+1-prev.alertMsgTick<3);// on the 3rd tick after it
// a stock just bought (13.5): its row is shaded from the first data that has it,
// for EXPORT_TICKS ticks; given up after 40 ticks without it
let justAdded=prev.justAdded||null;if(justAdded){const now=prev.tick+1;const ps=parsed&&parsed.data&&Array.isArray(parsed.data.positions)?parsed.data.positions:[];if(justAdded.seenTick===null||justAdded.seenTick===undefined){if(ps.some(p=>p&&p.ticker===justAdded.ticker))justAdded=merge(justAdded,{seenTick:now});else if(now-(justAdded.tick||0)>=40)justAdded=null;}else if(now-justAdded.seenTick>=EXPORT_TICKS)justAdded=null;}// the first data: the holdings list counts its pages from here, so it starts on page 1
const firstData=!(prev.raw&&prev.raw.data)&&parsed&&parsed.data;const rot=prev.hover?prev.rot:prev.rot+1;// (demoSettled lasts until data.json no longer says "example")
const demoSettled=!!prev.demoSettled&&!(parsed&&parsed.data&&parsed.data.demoKind!=="example");return merge(prev,{raw:parsed,parseError:parseError,tick:prev.tick+1,justAdded:justAdded,demoSettled:demoSettled,rot:rot,rotBase:firstData?rot:prev.rotBase,older:older,alertMsg:fade?null:prev.alertMsg,// 13.6: a saved note/target is held until data.json has surely caught up
notesLocal:prev.notesLocal&&!(prev.tick+1-(prev.notesLocal.tick||0)>=NOTES_HOLD_TICKS)?prev.notesLocal:null,benchWant:benchWantAfter(prev,parsed&&parsed.data),settingPending:prev.settingPending&&parsed&&parsed.data&&parsed.data.epoch!==prev.settingPending.epoch?null:prev.settingPending});}case"TOGGLE_GRAPH_BIG":return merge(prev,{graphBig:typeof event.on==="boolean"?event.on:!graphBigOf(prev)});case"SET_SHOW_BENCH":return merge(prev,{showBench:event.on===true});case"SET_COMPACT":return merge(prev,{compact:event.on===true,hoverT:null});case"EXPORT_MSG":// shown in the footer for a few ticks (stamped with the data tick)
return merge(prev,{exportMsg:event.text?{text:String(event.text),err:!!event.err,tip:event.tip?String(event.tip):"",tick:prev.tick}:null});case"BENCH_PICK":return merge(prev,{benchPick:typeof event.open==="boolean"?event.open:!prev.benchPick,benchInput:"",benchMsg:null});case"BENCH_INPUT":return merge(prev,{benchInput:String(event.value||"").slice(0,24),benchMsg:null});case"BENCH_MSG":return merge(prev,{benchMsg:event.msg||null});case"SET_BENCH":// picked (saved in the background): the picker closes
return merge(prev,{benchWant:normBench(event.value),benchSaved:false,benchPick:false,benchInput:"",benchMsg:null});case"BENCH_SAVED":return event.value===prev.benchWant?merge(prev,{benchSaved:true}):prev;case"BENCH_FAIL":// the save failed: back to the saved choice, the picker says why
return merge(prev,{benchWant:null,benchPick:true,benchMsg:event.msg||"could not save"});case"SET_SALES_EXPANDED":return merge(prev,{salesExpanded:event.on===true});case"SET_INCOME_VIEW":return merge(prev,{incomeView:["bars","next","years"].indexOf(event.view)>=0?event.view:"bars"});case"SET_POS":return merge(prev,{pos:event.pos===false?false:validPos(event.pos)});case"SET_SCALE":return merge(prev,{scale:validScale(event.scale)});case"SET_BT_MODE":return merge(prev,{btMode:event.mode==="weighted"?"weighted":"held"});case"OLDER_BUSY":return merge(prev,{older:{key:event.key,rows:event.key===prev.older.key?prev.older.rows:[],busy:true,msg:null}});case"OLDER_RESULT":{// answers for a table that has since changed are ignored
if(event.key!==prev.older.key)return prev;const byDate={};prev.older.rows.forEach(r=>{byDate[r[0]]=r;});(event.rows||[]).forEach(r=>{byDate[r[0]]=r;});const rows=Object.keys(byDate).sort().map(k=>byDate[k]);return merge(prev,{older:{key:event.key,rows:rows,busy:false,msg:event.error||null}});}case"HOVER":return merge(prev,{hover:event.on});case"SET_RANGE":return merge(prev,{range:event.range,from:null,mark:null,hoverT:null,dayMsg:null,dayInput:""});case"SET_FROM":// start the graph at the pinned moment
return merge(prev,{from:event.from,mark:null,hoverT:null,dayMsg:null,dayInput:""});case"CLEAR_FROM":return merge(prev,{from:null,hoverT:null});case"SET_SECTOR_FOCUS":return merge(prev,{sectorFocus:event.name,graphMode:"sectors",hoverT:null});case"HOVER_PT":return prev.hoverT===event.t?prev:merge(prev,{hoverT:event.t});case"SET_MARK":// a graph click (or a release) replaces any day typed into the date box
return merge(prev,{mark:event.mark,dayMsg:null,dayInput:""});case"PICK_DAY":// a day from the table or the date box: pin it and show a range that contains it
return merge(prev,{mark:event.mark,range:event.range,hoverT:null,dayMsg:null,dayInput:event.fromInput?prev.dayInput:event.mark.d});case"SET_DAY_INPUT":return merge(prev,{dayInput:event.value});case"DAY_MSG":return merge(prev,{dayMsg:event.msg});case"SET_DAY_PAGE":return merge(prev,{dayPage:Math.max(0,event.page)});case"SET_EARN_PAGE":return merge(prev,{earnPage:Math.max(0,event.page)});case"TOGGLE_SECTOR_SCALE":return merge(prev,{sectorScale:prev.sectorScale==="shared"?"own":"shared"});case"TOGGLE_SECTOR_ORDER":return merge(prev,{sectorOrder:prev.sectorOrder==="best"?"size":"best"});case"SET_PAGE":return merge(prev,{pinnedPage:prev.pinnedPage===event.page?null:event.page});case"SET_SECTION":return merge(prev,{pinnedSection:prev.pinnedSection===event.section?null:event.section});case"SET_VIEW":return merge(prev,{view:event.view});case"SET_MAP_RANGE":return merge(prev,{mapRange:event.range});// RANGES, "VOL" or "DRIFT" (12.10, only offered with targets)
case"TOGGLE_MAP_EXPAND":return merge(prev,{mapExpanded:!prev.mapExpanded,view:"map"});case"SET_STOCK":{// another stock (or back) forgets the alert box and the headlines
// (headlines are per stock in newsBy: openStock reloads them for another stock)
const other=event.ticker!==prev.focusTicker;const fresh=!!event.ticker&&event.ticker!==prev.lookTicker;return merge(prev,{focusTicker:event.ticker,mapExpanded:false,detailMsg:null,lookTicker:fresh?event.ticker:prev.lookTicker,lookBy:fresh?keepSome(prev.lookBy,event.ticker,{data:null,busy:false,error:null}):prev.lookBy,alertInput:other?"":prev.alertInput,alertMsg:other?null:prev.alertMsg,alertBusy:other?false:prev.alertBusy,// 13.6: and the note / price target box
noteEdit:other?null:prev.noteEdit||null,noteInput:other?"":prev.noteInput||"",noteBusy:other?false:!!prev.noteBusy,noteMsg:other?null:prev.noteMsg||null});}case"SET_ALERT_INPUT":return merge(prev,{alertInput:String(event.value||""),alertMsg:null});case"ALERT_BUSY":return merge(prev,{alertBusy:true,alertMsg:event.msg||"working…"});case"ALERT_RESULT":// ok clears the box; an error keeps what was typed
return merge(prev,{alertBusy:false,alertMsg:event.msg||null,alertMsgTick:prev.tick,alertInput:event.ok&&event.clear?"":prev.alertInput});// 13.6: the note / price target box of a detail view (NoteRows)
case"NOTE_EDIT":return merge(prev,{noteEdit:event.field==="target"?"target":"note",noteInput:String(event.value||""),noteMsg:null});case"NOTE_INPUT":return merge(prev,{noteInput:prev.noteEdit==="note"?String(event.value||"").slice(0,200):String(event.value||""),noteMsg:null});case"NOTE_CANCEL":return merge(prev,{noteEdit:null,noteInput:"",noteMsg:null});case"NOTE_BUSY":return merge(prev,{noteBusy:true,noteMsg:"saving…"});case"NOTE_RESULT":{// ok closes the box and holds the saved entry; an error keeps what was typed
const base={noteBusy:false,noteMsg:event.msg||null,noteMsgTick:prev.tick};if(!event.ok)return merge(prev,base);const held=notesFresh(prev.notesLocal,prev.tick)?prev.notesLocal.map:{};const add={};if(typeof event.ticker==="string"&&event.ticker)add[event.ticker.toUpperCase()]=event.entry||null;return merge(prev,merge(base,{noteEdit:null,noteInput:"",notesLocal:{tick:prev.tick,map:merge(held,add)}}));}case"NEWS_BUSY":return merge(prev,{newsBy:keepSome(prev.newsBy,event.ticker,{items:[],busy:true,error:null})});case"NEWS_RESULT":// kept per stock (another window may show it)
if(!prev.newsBy||!prev.newsBy[event.ticker])return prev;return merge(prev,{newsBy:keepSome(prev.newsBy,event.ticker,{items:Array.isArray(event.items)?event.items:[],busy:false,error:event.error||null})});case"SET_NEWS_PREF":return merge(prev,{newsPref:event.on===true});case"TOGGLE_ALERTS_EXPANDED":return merge(prev,{alertsExpanded:!prev.alertsExpanded});case"SET_REBAL_WHOLE":return merge(prev,{rebalWhole:typeof event.on==="boolean"?event.on:null});case"TOGGLE_REBAL_EXPANDED":return merge(prev,{rebalExpanded:!prev.rebalExpanded});case"LOOK_BUSY":{const had=(prev.lookBy||{})[event.ticker];return merge(prev,{lookBy:keepSome(prev.lookBy,event.ticker,{data:had?had.data:null,busy:true,error:null})});}case"LOOK_RESULT":{// kept per stock (another window may show it); a stock dropped meanwhile is ignored
const had=(prev.lookBy||{})[event.ticker];if(!had)return prev;return merge(prev,{lookBy:keepSome(prev.lookBy,event.ticker,{data:event.data||had.data,busy:false,error:event.error||null})});}case"SET_DETAIL_RANGE":return merge(prev,{detailRange:event.range});case"DETAIL_MSG":return merge(prev,{detailMsg:event.msg});case"PREFILL":// "buy" from a detail view: open the form with the ticker filled in
return merge(prev,{addForm:merge(EMPTY_FORM,{ticker:event.ticker}),showAdd:true,focusTicker:null,picked:null,search:NO_SEARCH,addMsg:null,pendingAction:null});case"CYCLE_SORT":return merge(prev,{sort:SORTS[(SORTS.indexOf(prev.sort)+1)%SORTS.length],pinnedPage:null});case"TOGGLE_ADD":return merge(prev,{showAdd:!prev.showAdd,addMsg:null,pendingAction:null,search:NO_SEARCH});case"SET_ADD_FIELD":{const form=Object.assign({},prev.addForm);form[event.field]=event.value;// typing over a picked stock forgets the pick
const picked=event.field==="ticker"&&prev.picked&&prev.picked.symbol!==event.value.toUpperCase().trim()?null:prev.picked;return merge(prev,{addForm:form,picked:picked,pendingAction:null});}case"SEARCH_BUSY":return merge(prev,{search:merge(prev.search,{query:event.query,busy:true,error:null})});case"SEARCH_RESULTS":// answers can arrive out of order; keep only the one for the current text
if(event.query!==(prev.addForm.ticker||"").trim())return prev;return merge(prev,{search:{query:event.query,results:event.results,busy:false,error:event.error||null}});case"PICK":return merge(prev,{addForm:merge(prev.addForm,{ticker:event.item.symbol}),picked:event.item,search:NO_SEARCH,addMsg:null});case"FORM_RESET":return merge(prev,{addForm:EMPTY_FORM,picked:null,search:NO_SEARCH});case"ADD_MSG":return merge(prev,{addMsg:event.msg,addMsgTip:event.tip||null,addMsgTone:event.tone||null,addMsgTick:prev.tick});case"JUST_ADDED":return merge(prev,{justAdded:event.ticker?{ticker:event.ticker,seenTick:null,tick:prev.tick}:null});case"SET_PENDING":return merge(prev,{pendingAction:event.pending,addMsg:null});case"CLEAR_PENDING":return merge(prev,{pendingAction:null});case"DEMO_SETTLED":return merge(prev,{demoSettled:true});// 13.5: a choice on the waiting buy (the demo holdings: replace or keep)
case"PENDING_SET":return merge(prev,{pendingAction:prev.pendingAction?Object.assign({},prev.pendingAction,event.patch):null});case"SET_GRAPH_MODE":return merge(prev,{graphMode:event.mode,hoverT:null});case"TOGGLE_PL_MODE":return merge(prev,{plMode:prev.plMode==="cost"?"invested":"cost"});// windows (12.12). The first three are shared (updateState ignores their `w`)
case"SET_DISPLAY":{// a display object (normalised here), or null/false = one plain window
const disp=event.display?normDisplay(event.display):null;const keep={};if(disp)disp.windows.forEach(w=>{if(prev.wins[w.id])keep[w.id]=prev.wins[w.id];});else if(prev.wins.main)keep.main=prev.wins.main;return merge(prev,{display:disp||false,wins:keep,geo:null,front:disp&&disp.windows.some(w=>w.id===prev.front)?prev.front:null});}case"GEO":return merge(prev,{geo:event.geo&&typeof event.geo==="object"&&typeof event.geo.id==="string"?event.geo:null});case"FRONT":return typeof event.w==="string"&&prev.front!==event.w?merge(prev,{front:event.w}):prev;// the ⚙ editor: `group` (optional) picks the section it opens at
case"TOGGLE_EDITOR":return merge(prev,{editOpen:!prev.editOpen,editConfirm:null,editQuery:"",editGroup:typeof event.group==="string"?event.group:prev.editGroup});case"OPEN_EDITOR":return merge(prev,{editOpen:true,editConfirm:null,editQuery:"",// (the welcome card's links)
editGroup:typeof event.group==="string"?event.group:prev.editGroup});case"CLOSE_EDITOR":{// (13.6: Esc also closes an open note box)
const nb=prev.noteEdit?{noteEdit:null,noteInput:""}:{};return prev.editOpen?merge(prev,merge(nb,{editOpen:false,editConfirm:null,editQuery:"",opacityDraft:null})):prev.opacityDraft!=null?merge(prev,merge(nb,{opacityDraft:null})):prev.noteEdit?merge(prev,nb):prev;}// the background slider (13.5): a number previews it, null = back to the saved value
case"OPACITY_DRAFT":return merge(prev,{opacityDraft:typeof event.value==="number"&&isFinite(event.value)?Math.min(1,Math.max(0.3,event.value)):null});case"EDIT_QUERY":return merge(prev,{editQuery:typeof event.value==="string"?event.value.slice(0,40):""});// the import panel (13.4): null closes it, a patch merges into it
case"IMPORT_SET":return merge(prev,{imp:event.imp===null?null:Object.assign({},prev.imp||IMPORT_EMPTY,event.imp)});// the footer's update offer (13.4)
case"UPDATE_ASK":return merge(prev,{updateAsk:event.on===true});case"UPDATE_LATER":return merge(prev,{updateLater:typeof event.version==="string"?event.version:null,updateAsk:false});// stamped with the running VERSION: after an update reloads the widget, a
// leftover "updating…" from the old version is not shown any more (13.5)
case"UPDATE_MSG":return merge(prev,{updateMsg:event.msg?{text:String(event.msg),err:!!event.err,tick:prev.tick,version:VERSION}:null});// the setup / no-data card (13.5): its message line and the raw log's "details" switch
case"SETUP_MSG":return merge(prev,{setupMsg:event.msg?{text:String(event.msg),err:!!event.err,tick:prev.tick}:null});case"ERR_DETAILS":return merge(prev,{errDetails:!prev.errDetails});case"UPDATE_CHECKING":return merge(prev,{updateChecking:event.on===true});case"UPDATE_INFO":{// "check now" answered: data.update as the next refresh would carry it
if(!prev.raw||!prev.raw.data||typeof prev.raw.data!=="object")return merge(prev,{updateChecking:false});return merge(prev,{updateChecking:false,raw:Object.assign({},prev.raw,{data:Object.assign({},prev.raw.data,{update:event.info||null})})});}// "reset portfolio settings": this session's clicks on those settings are forgotten too
case"PF_RESET_LOCAL":return merge(prev,{newsPref:null,rebalWhole:null,benchWant:null,benchSaved:false,settingPending:null});// the open section (one at a time): null = "window", "none" = all closed
case"EDIT_GROUP":return merge(prev,{editGroup:typeof event.group==="string"?event.group:null,editConfirm:null});// "reset all windows" (the ⚙ editor, This window; setting display reset-all): one plain window at the
// default spot, zoom 1, the 12.11 look; every window's own state starts over
case"RESET_LOOK":return merge(prev,{display:false,wins:{},geo:null,front:null,pos:false,scale:1,graphBig:false,showBench:true,compact:false});case"EDIT_CONFIRM":return merge(prev,{editConfirm:event.what||null});// the target-mix editor (13.6): a typed field, a sector split by holding or not, a whole fill, drop the draft
case"TGT_DRAFT":{const dr=prev.tgtDraft||{vals:{},split:{}};const vals=Object.assign({},dr.vals);vals[String(event.key)]=String(event.value===null||event.value===undefined?"":event.value).slice(0,8);return merge(prev,{tgtDraft:{vals:vals,split:Object.assign({},dr.split)}});}case"TGT_SPLIT":{const dr=prev.tgtDraft||{vals:{},split:{}};const split=Object.assign({},dr.split);split[String(event.sector)]=!!event.on;return merge(prev,{tgtDraft:{vals:Object.assign({},dr.vals),split:split}});}case"TGT_FILL":return merge(prev,{tgtDraft:{vals:Object.assign({},event.vals||{}),split:Object.assign({},event.split||{})}});case"TGT_RESET":return merge(prev,{tgtDraft:null});case"SET_NEWS_PAGE":return merge(prev,{newsPage:Math.max(0,Math.round(event.page)||0)});// the news page's live keyword (13.1): typed over cfg.q `from`; a cfg.q change from elsewhere wins again
case"SET_NEWS_QUERY":return merge(prev,{newsQuery:typeof event.value==="string"?event.value:null,newsQFrom:typeof event.from==="string"?event.from:"",newsPage:0});case"NEWS_PICK_MSG":return merge(prev,{newsPickMsg:typeof event.msg==="string"?event.msg:null});// the ⚙ editor's shared switches and notes (13.2)
case"EDIT_ADVANCED":return merge(prev,{editAdvanced:event.on===true});case"EDIT_HINTS":return merge(prev,{editHints:event.on!==false});case"SETTING_PENDING":return merge(prev,{settingPending:event.key&&typeof event.key==="string"?{key:event.key,epoch:event.epoch,msg:String(event.msg||"")}:null});case"EDIT_MSG":{if(typeof event.key!=="string")return prev;const m=Object.assign({},prev.editMsg||{});if(typeof event.msg==="string"&&event.msg)m[event.key]=event.msg;else delete m[event.key];// a failed background save: the slider falls back to the saved value (the error shows under the row)
if(event.key==="opacity"&&typeof event.msg==="string"&&event.msg)return merge(prev,{editMsg:m,opacityDraft:null});return merge(prev,{editMsg:m});}// a saved setting's reply (set_setting.py's ui value) goes into data.ui at
// once, so the editor shows it before the next data.json is read
case"THEME_MEDIA":return merge(prev,{mediaTick:(prev.mediaTick||0)+1});// the Mac's appearance changed (theme auto)
case"UI_PATCH":{if(typeof event.key!=="string"||!prev.raw||!prev.raw.data||typeof prev.raw.data!=="object")return prev;const ui=Object.assign({},prev.raw.data.ui&&typeof prev.raw.data.ui==="object"?prev.raw.data.ui:{});ui[event.key]=event.value;if(event.key==="opacity")return merge(prev,{opacityDraft:null,// the slider's save landed
raw:Object.assign({},prev.raw,{data:Object.assign({},prev.raw.data,{ui:ui})})});return merge(prev,{raw:Object.assign({},prev.raw,{data:Object.assign({},prev.raw.data,{ui:ui})})});}// 13.6: "undo" in ⚙ (the time `at` always comes in the event)
case"UNDO_OFFER":return merge(prev,{settingUndo:undoRec(event.undo,event.at)});case"UNDO_BUSY":return prev.settingUndo?merge(prev,{settingUndo:Object.assign({},prev.settingUndo,{busy:!!event.on})}):prev;case"UNDO_NOTE":return merge(prev,{undoNote:event.text?{text:String(event.text).slice(0,160),err:!!event.err,at:event.at}:null});case"UNDO_APPLIED":{// the restored values go into data.ui at once (one merge, like UI_PATCH),
// and this session's mirrors of those keys go back to "as saved"
const ui=event.ui&&typeof event.ui==="object"?event.ui:{};const patch={settingUndo:undoRec(event.next,event.at)};if(prev.raw&&prev.raw.data&&typeof prev.raw.data==="object"){const cur=prev.raw.data.ui&&typeof prev.raw.data.ui==="object"?prev.raw.data.ui:{};patch.raw=Object.assign({},prev.raw,{data:Object.assign({},prev.raw.data,{ui:Object.assign({},cur,ui)})});}if("display"in ui){const disp=normDisplay(ui.display),keep={},wins=prev.wins||{};if(disp)disp.windows.forEach(w=>{if(wins[w.id])keep[w.id]=wins[w.id];});else if(wins.main)keep.main=wins.main;Object.assign(patch,{display:null,wins:keep,geo:null,front:disp&&disp.windows.some(w=>w.id===prev.front)?prev.front:null});}UNDO_MIRRORS.forEach(m=>{if(m[0]in ui)patch[m[1]]=null;});if("benchmark"in ui)patch.benchSaved=false;return merge(prev,patch);}default:return prev;}};// Each data tick: every window's own pages/sections rotate (not while the
// pointer is over that window), and a message under its alerts panel (no stock
// open) goes after ~15 s.
const tickWindows=(prev,next)=>{const wins={};const ids=Object.keys(prev.wins);const firstData=!(prev.raw&&prev.raw.data)&&next.raw&&next.raw.data;// every window starts on page 1
windowsOf(next).forEach(w=>{if(ids.indexOf(w.id)<0)ids.push(w.id);});ids.forEach(id=>{const own=prev.wins[id]||WIN_INITIAL;const fade=own.alertMsg&&!own.alertBusy&&!own.focusTicker&&!(prev.tick+1-own.alertMsgTick<3);// on the 3rd tick after it
// 13.6: an ok note message ("saved…") goes the same way; an error stays
const noteFade=own.noteMsg&&!own.noteBusy&&String(own.noteMsg).indexOf("error")!==0&&!(prev.tick+1-(own.noteMsgTick||0)<3);const rot=own.hover?own.rot:own.rot+1;wins[id]=merge(own,{rot:rot,rotBase:firstData?rot:own.rotBase,alertMsg:fade?null:own.alertMsg,noteMsg:noteFade?null:own.noteMsg||null});});return merge(next,{wins:wins});};const SHARED_EVENTS={SET_DISPLAY:true,GEO:true,FRONT:true,RESET_LOOK:true,UNDO_APPLIED:true};// (UNDO_APPLIED 13.6: it may drop windows)
// An event with a string `w` (every event from a window's render) runs on that
// window's view: the shared state plus wins[w]; its WIN_KEYS go back to
// wins[w], the rest to the shared state. Events without `w` run on the shared state.
const updateState=(event,prevIn)=>{const sp=sane(prevIn);const prev=sp.wins&&typeof sp.wins==="object"?sp:merge(sp,{wins:{}});if(!event)return prev;if(event.type==="UB/COMMAND_RAN")return tickWindows(prev,coreReducer(event,prev));if(event.type==="CLOSE_ALL_EDITORS"){const wins={};Object.keys(prev.wins).forEach(id=>{wins[id]=coreReducer({type:"CLOSE_EDITOR"},prev.wins[id]);});return merge(prev,{wins:wins});}const w=typeof event.w==="string"&&!SHARED_EVENTS[event.type]?event.w:null;if(w===null)return coreReducer(event,prev);const view=Object.assign({},prev,prev.wins[w]||WIN_INITIAL);const next=coreReducer(event,view);if(next===view)return prev;const mine={},root=Object.assign({},next);WIN_KEYS.forEach(k=>{mine[k]=next[k];root[k]=prev[k];});root.wins=Object.assign({},next.wins);root.wins[w]=mine;return root;};// ------------------------------------------------------------------ colors
// Every colour is a CSS variable (13.4): a window's root sets them for the
// theme in use (themeClass), so the same styles draw the dark and the light
// look. Colours that JavaScript mixes itself (heat-map tiles, volatility)
// come from paletteNow() instead.
exports.updateState=updateState;const C={ink:"var(--pw-ink)",dim:"var(--pw-dim)",faint:"var(--pw-faint)",up:"var(--pw-up)",down:"var(--pw-down)",amber:"var(--pw-amber)",orange:"var(--pw-orange)",// over its target allocation (12.10)
line:"var(--pw-line)",// the ONE color all line graphs use
mapCap:"var(--pw-map-cap)",// heat-map sector caption
bench:"var(--pw-bench)",// the index line
grid:"var(--pw-grid)"// y gridlines
};// bg / fg: "r, g, b" for rgba(var(--pw-bg), <opacity>) and the translucent
// highlights rgba(var(--pw-fg), 0.07); surface = the panel colour behind a
// marker dot; neutral = the heat map's resting tile; vol = the volatility
// score colours 1-10 (cool grey -> amber -> orange -> pink, never green/red)
const PALETTES={dark:{ink:"#E7EDF3",dim:"#7C8794",faint:"rgba(255,255,255,0.07)",up:"#34D399",down:"#FB7185",amber:"#F5C044",orange:"#FF9F0A",line:"#AFC3D4",bg:"17, 21, 27",fg:"255, 255, 255",surface:"#11151B",tileInk:"rgba(255,255,255,0.94)",tileSub:"rgba(255,255,255,0.78)",tileShadow:"0 1px 2px rgba(0,0,0,0.35)",mapCap:"rgba(255,255,255,0.5)",bench:"rgba(124,135,148,0.6)",grid:"rgba(255,255,255,0.07)",areaAlpha:0.07,neutral:[44,44,46],vol:[null,"#8FA3B8","#8FA3B8","#C9D3DD","#C9D3DD","#F5C044","#F5C044","#FB923C","#FB923C","#F472B6","#F472B6"]},light:{ink:"#1B2430",dim:"#66717F",faint:"rgba(0,0,0,0.07)",up:"#0E9F6E",down:"#DC3B63",amber:"#A36A00",orange:"#D9730D",line:"#3A5A7C",bg:"247, 248, 250",fg:"0, 0, 0",surface:"#F7F8FA",tileInk:"rgba(0,0,0,0.86)",tileSub:"rgba(0,0,0,0.66)",tileShadow:"none",mapCap:"rgba(0,0,0,0.55)",bench:"rgba(63,76,91,0.85)",grid:"rgba(0,0,0,0.10)",areaAlpha:0.12,neutral:[221,225,230],vol:[null,"#7D91A6","#7D91A6","#95A2B0","#95A2B0","#A36A00","#A36A00","#D9730D","#D9730D","#C2297B","#C2297B"]}};const THEMES=["dark","light","auto"];let THEME_NOW="dark";// the palette in use, set by render() before anything draws
const paletteNow=()=>PALETTES[THEME_NOW]||PALETTES.dark;const prefersLight=()=>{try{return!!(window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches);}catch(e){return false;}};// _settings.theme (data.ui.theme): dark (default) | light | auto = the Mac's appearance
const themeOf=st=>{const t=uiPrefs(st).theme;return t==="light"?"light":t==="auto"?prefersLight()?"light":"dark":"dark";};// _settings.opacity (data.ui.opacity): how solid the window's background is, 0.3-1
const opacitySaved=st=>{const v=uiPrefs(st).opacity;return typeof v==="number"&&isFinite(v)?Math.min(1,Math.max(0.3,v)):0.88;};// what is shown: the slider's draft while it is dragged (13.5), else the saved value
const opacityOf=st=>{const v=st&&st.opacityDraft;return typeof v==="number"&&isFinite(v)?Math.min(1,Math.max(0.3,v)):opacitySaved(st);};const themeClass=(theme,opacity)=>{const P=PALETTES[theme]||PALETTES.dark;return(0,_uebersicht.css)(_templateObject(),P.ink,P.dim,P.faint,P.up,P.down,P.amber,P.orange,P.line,P.bg,P.fg,P.surface,P.tileInk,P.tileSub,P.tileShadow,P.mapCap,P.bench,P.grid,opacity);};// volatility score 1-10: cool grey -> amber -> orange -> pink (never green/red,
// which mean up/down everywhere else)
const VOL_COLOR=PALETTES.dark.vol;// (the dark set; volColor picks the theme's)
const VOL_LABEL=["","very calm","calm","moderate","moderate","lively","lively","wild","wild","extreme","extreme"];const volColor=s=>paletteNow().vol[s]||C.dim;const volTip=(pct,score)=>score?"volatility "+pct+"%/yr — score "+score+"/10, "+VOL_LABEL[score]+"\n(how much the price swung over the last 3 months; about 1 point per 10%)":"not enough price history for a volatility score yet";// ------------------------------------------------------------------ styles
// The default spot (until the widget is dragged: then _settings.position,
// applied with position: fixed on the widget's own root — see frame()).
const className="\n  top: 2px;\n  right: 24px;\n  width: ".concat(WIDGET_W,"px;\n  font-family: -apple-system, \"Helvetica Neue\", sans-serif;\n  color: #E7EDF3;\n");// No backdrop-filter: Übersicht's blur layer drops in and out on re-renders,
// which reads as the card flickering. A near-opaque fill composites the same
// on every repaint.
exports.className=className;const panel=(0,_uebersicht.css)(_templateObject2());const mono=(0,_uebersicht.css)(_templateObject3());const eyebrow=(0,_uebersicht.css)(_templateObject4(),C.dim);const sectionGap=(0,_uebersicht.css)(_templateObject5(),C.faint);const rowFlex=(0,_uebersicht.css)(_templateObject6());// 13.6: the goal line's progress bar (LAYOUT_K.GOAL_BAR wide with its margin)
const goalBar=(0,_uebersicht.css)(_templateObject7());const cols=(0,_uebersicht.css)(_templateObject8());const colLeft=(0,_uebersicht.css)(_templateObject9());const colLeftWide=(0,_uebersicht.css)(_templateObject10());const colRight=(0,_uebersicht.css)(_templateObject11(),C.faint);// 12.12: the middle one of three columns, and a single column
const colMid=(0,_uebersicht.css)(_templateObject12(),C.faint);const colSolo=(0,_uebersicht.css)(_templateObject13());const tabBtn=(0,_uebersicht.css)(_templateObject14(),C.dim);const tabActive=(0,_uebersicht.css)(_templateObject15(),C.ink);const dot=(0,_uebersicht.css)(_templateObject16());// the holdings list's page dots and ‹ › arrows (13.5): bigger than the carousel's dots
const pageDot=(0,_uebersicht.css)(_templateObject17());const linkBtn=(0,_uebersicht.css)(_templateObject18(),C.dim);// ------------------------------------------------------------------ format
const LOCALE=undefined;// the Mac's own region settings
let CUR="USD";// display currency, set from the data every render
const fmtCache={};const nf=opts=>{const key=JSON.stringify(opts);if(!fmtCache[key]){try{fmtCache[key]=new Intl.NumberFormat(LOCALE,opts);}catch(e){// older WebKit without narrowSymbol
try{fmtCache[key]=new Intl.NumberFormat(LOCALE,Object.assign({},opts,{currencyDisplay:"symbol"}));}catch(e2){// never let a strange currency code take the widget down
fmtCache[key]=new Intl.NumberFormat(LOCALE,{minimumFractionDigits:opts.minimumFractionDigits,maximumFractionDigits:opts.maximumFractionDigits});}}}return fmtCache[key];};// the display currency from the data: any ISO 4217 code ("EUR", "SEK", "JPY"…)
const setCurrency=code=>{const c=String(code||"USD").toUpperCase();CUR=/^[A-Z]{3}$/.test(c)?c:"USD";};const curOpts=digits=>({style:"currency",currency:CUR,currencyDisplay:"narrowSymbol",minimumFractionDigits:digits,maximumFractionDigits:digits});const curSymbol=()=>{const part=nf(curOpts(0)).formatToParts(0).find(p=>p.type==="currency");return part?part.value:CUR;};// minor-unit digits of the display currency (2 for USD/EUR, 0 for JPY/KRW)
const curDigits=()=>{const o=nf({style:"currency",currency:CUR}).resolvedOptions();return typeof o.maximumFractionDigits==="number"?Math.min(2,o.maximumFractionDigits):2;};const money=(v,cents)=>{if(v===null||v===undefined||isNaN(v))return"—";const abs=Math.abs(v);return nf(curOpts(Math.min(abs>=1000&&!cents?0:2,curDigits()))).format(abs);};const num=(v,digits)=>v===null||v===undefined||isNaN(v)?"—":nf({minimumFractionDigits:digits,maximumFractionDigits:digits}).format(v);// sign of an amount as shown: none when it rounds to zero ("0.00%", not "−0.00%")
const signOf=(v,zero)=>Math.abs(v)<zero?"":v>0?"+":"−";const signedMoney=v=>v===null||v===undefined||isNaN(v)?"—":signOf(v,Math.abs(v)>=1000||curDigits()===0?0.5:0.005)+money(v);const pct=v=>v===null||v===undefined||isNaN(v)?"—":signOf(v,0.005)+(Math.abs(v)>=1000?num(Math.round(Math.abs(v)),0):Math.abs(v).toFixed(2))+"%";const upDown=v=>v>=0?C.up:C.down;const fmtTime=epoch=>new Date(epoch*1000).toLocaleTimeString(LOCALE,{hour:"2-digit",minute:"2-digit",hour12:false});const fmtDay=epoch=>new Date(epoch*1000).toLocaleDateString(LOCALE,{month:"short",day:"numeric"});// "Mar 14", or "Mar 14, 2019" outside the current year
const fmtDayY=epoch=>{const dt=new Date(epoch*1000);return dt.getFullYear()===new Date().getFullYear()?fmtDay(epoch):dt.toLocaleDateString(LOCALE,{month:"short",day:"numeric",year:"numeric"});};const fmtIsoLong=iso=>new Date(iso+"T12:00:00").toLocaleDateString(LOCALE,{month:"short",day:"numeric",year:"numeric"});// local calendar date of an epoch, as YYYY-MM-DD
const isoOf=epoch=>{const dt=new Date(epoch*1000);return dt.getFullYear()+"-"+String(dt.getMonth()+1).padStart(2,"0")+"-"+String(dt.getDate()).padStart(2,"0");};const fmtDate=iso=>{if(!iso)return"—";return new Date(iso+"T12:00:00").toLocaleDateString(LOCALE,{month:"short",day:"numeric"});};const daysAway=iso=>{if(!iso)return null;return Math.round((new Date(iso+"T12:00:00")-new Date())/86400000);};const fmtStamp=(t,withTime)=>{const dt=new Date(t*1000);const opts=dt.getFullYear()===new Date().getFullYear()?{weekday:"short",month:"short",day:"numeric"}:{month:"short",day:"numeric",year:"numeric"};const day=dt.toLocaleDateString(LOCALE,opts);return withTime?day+" "+fmtTime(t):day;};// axis labels: clock times within a day and a half, weekday + time within a
// week, dates within about a year, month + year beyond that
const axisLabel=(t,tA,tB)=>{const span=tB-tA;if(span<=36*3600)return fmtTime(t);if(span<=6*86400)return new Date(t*1000).toLocaleDateString(LOCALE,{weekday:"short"})+" "+fmtTime(t);if(span<=330*86400)return fmtDay(t);return new Date(t*1000).toLocaleDateString(LOCALE,{month:"short",year:"numeric"});};const AXIS_H=12;// room under a plot for its x labels
// x labels inside the plot: start, three in between, end (repeats dropped)
const XLabels=({ticks,y})=>html("g",{pointerEvents:"none"},ticks.map((tk,i)=>i>0&&tk.label===ticks[i-1].label?null:html("text",{key:i,x:tk.x,y:y,fill:C.dim,fontSize:"8",fontFamily:"\"SF Mono\", Menlo, monospace",textAnchor:i===0?"start":i===ticks.length-1?"end":"middle"},tk.label)));const TICK_FRACTIONS=[0,0.25,0.5,0.75,1];const signedExact=v=>v===null||v===undefined||isNaN(v)?"—":signOf(v,curDigits()===0?0.5:0.005)+money(v,true);const fmtAge=s=>s<90?s+"s":s<5400?Math.round(s/60)+"m":Math.round(s/3600)+"h";// "1 value", "17 values"
const plural=(n,w)=>n+" "+w+(n===1?"":"s");// The no-data card's and the "!" / "last refresh failed" tooltips' plain reason
// (13.5): the backend's last log lines -> {text, kind}; the first match wins.
// Never a bare /python/ or /rate/: every traceback has python in its paths,
// and "separate" contains "rate".
const plainError=raw=>{const t=String(raw||"");if(/This folder must be named/.test(t))return{text:t,kind:"folder"};const j=t.match(/(not valid JSON|JSONDecodeError)[^\n]*?line (\d+)/);if(j)return{text:"positions.json has a typo near line "+j[2],kind:"json"};if(/not valid JSON|JSONDecodeError/.test(t))return{text:"positions.json has a typo",kind:"json"};if(/yfinance is not installed|No module named|ModuleNotFoundError/.test(t))return{text:"Python lost its yfinance package — run setup again",kind:"python"};if(/\b429\b|Too Many Requests|rate.?limit/i.test(t))return{text:"couldn't reach Yahoo Finance (it is busy) — the widget tries again by itself",kind:"yahoo"};if(/no prices at all|timed out|URLError|ConnectionError|nodename nor servname|Network is unreachable/i.test(t))return{text:"couldn't reach Yahoo Finance — is the Mac online? The widget tries again by itself",kind:"yahoo"};return{text:"the last refresh failed",kind:"other"};};const fmtAxis=(v,step)=>{const sign=v<0?"−":"";const a=Math.abs(v);const sym=curSymbol().replace(/[A-Za-z]$/,"$&\u00a0");// "kr 27,250", not "kr27,250"
if(step<1)return sign+sym+num(a,Math.min(2,curDigits()));if(a>=1000){if(step<100)return sign+sym+num(Math.round(a),0);// steps are 1 / 2 / 5 × a power of ten, so one decimal tells 100-step
// ticks apart ("$298.4k"); two ("$298.40k") ran into the graph's edge
const dec=step<1000?1:0;return sign+sym+(a/1000).toFixed(dec)+"k";}return sign+sym+Math.round(a);};// Shell-quote for run(): values are validated first anyway; this keeps any
// future free-text field from ever reaching the shell unquoted.
const shq=s=>"'"+String(s).replace(/'/g,"'\\''")+"'";const helper=args=>"cd ".concat(shq(DIR)," && bash ./widget_command.sh ")+args.map(shq).join(" ");// A headline link is opened only when it is a plain https:// URL made of URL
// characters (the tracker already encodes the rest), and always shell-quoted.
const HTTPS_URL=/^https:\/\/[A-Za-z0-9\-._~:\/?#\[\]@!$&()*+,;=%]+$/;const openCmd=url=>typeof url==="string"&&url.length<=2000&&HTTPS_URL.test(url)?"open "+shq(url):null;// ------------------------------------------------------------------ move / resize / scroll
// Drag the title row (or the ⠿ grip) to move a window, its right edge, bottom
// edge or corner (12.12) to size it; double-click a grip to undo. A move sets
// the root's style directly (no re-render per mousemove); a resize sends a
// draft (GEO) once per animation frame so the layout reflows live. On release
// the state takes over and the choice is saved once (widget_command.sh setting).
// The zoom (12.8's corner grip) lives in the ⚙ editor now.
const DRAG_MIN=4;// px the pointer travels before a press becomes a drag (a click stays a click)
const KEEP_ON=60;// px of the widget that always stay on screen
const BOTTOM_GAP=10;// px left free under a widget that scrolls
const SCALE_SNAP=0.04;// within this of 100 % a zoom snaps to 100 %
// a zoom (the ⚙ editor's slider): clamped, snapped to 1 near it, 2 decimals
const snapScale=v=>{const c=Math.max(SCALE_MIN,Math.min(SCALE_MAX,v));return Math.abs(c-1)<SCALE_SNAP?1:Math.round(c*100)/100;};// keep KEEP_ON px of a visW-wide widget on a vw x vh screen; never above the
// top, so the title row (the handle) can always be reached
const clampPos=(p,visW,vw,vh)=>{if(!isNumber(vw)||!isNumber(vh))return p;return{x:Math.round(Math.min(Math.max(p.x,KEEP_ON-visW),vw-KEEP_ON)),y:Math.round(Math.min(Math.max(p.y,0),vh-KEEP_ON))};};// a resize from the edge / corner grips (12.12): the new width and height
// (unscaled px) for a pointer travel of dx, dy screen px at zoom s0: 300–1400
// wide, 160–2000 high, and never past the screen (frameWidth / the screen's
// bottom under the window's top). "r" changes only the width, "b" the height.
const resizeTo=(g,dx,dy,vw,vh)=>{const out={};if(g.kind!=="b")out.w=frameWidth(g.w0+dx/g.s0,g.s0,vw);if(g.kind!=="r"){const h=clampInt(g.h0+dy/g.s0,WIN_H_MIN,WIN_H_MAX);out.h=isNumber(vh)?Math.min(h,Math.max(WIN_H_MIN,Math.floor((vh-Math.max(0,g.at.y)-BOTTOM_GAP)/g.s0))):h;}return out;};const nextFrame=f=>typeof requestAnimationFrame==="function"?requestAnimationFrame(f):setTimeout(f,16);// the root's style: the className spot (absolute in the Übersicht container,
// scaled from its top-right corner) or the dragged-to spot (fixed, scaled
// from its top-left). The same keys either way, so React always owns them.
// Wu = the window's width (unscaled px); at the default spot a wider or
// narrower window grows / shrinks leftwards from the className spot.
const frameStyle=(pos,s,Wu)=>({position:pos?"fixed":"absolute",left:pos?pos.x+"px":"auto",top:pos?pos.y+"px":"0px",right:pos?"auto":"0px",width:pos||isNumber(Wu)&&Wu!==WIDGET_W?(isNumber(Wu)?Wu:WIDGET_W)+"px":"100%",transform:s===1?"none":"scale("+s+")",transformOrigin:pos?"top left":"top right"});// how tall the panel may be (unscaled px) with its top at `top` on a screen
// vh high: down to the screen's bottom, less a small gap
const frameMaxHeight=(vh,top,s)=>Math.floor(Math.max(KEEP_ON,vh-Math.max(0,top)-BOTTOM_GAP)/s);const winSize=()=>typeof window!=="undefined"?[window.innerWidth,window.innerHeight]:[null,null];// a window's width (unscaled px): its own (or the live draft), 300–1400, and
// never wider than the screen; the 12.11 window is always 664
const frameWidth=(w,zoom,vw)=>{const Wu=clampInt(isNumber(w)?w:WIDGET_W,WIN_W_MIN,WIN_W_MAX);return isNumber(vw)?Math.min(Wu,Math.max(WIN_W_MIN,Math.floor(vw/zoom)-16)):Wu;};// where a window without a saved spot goes: the first one at the className
// spot (null), the others cascaded down-left from the top-right corner
const CASCADE=32;const cascadePos=(i,Wu,zoom,vw)=>({x:Math.round((isNumber(vw)?vw:1440)-24-Wu*zoom-CASCADE*i),y:2+CASCADE*i});const winSpot=(win,i,Wu,zoom,vw)=>isNumber(win.x)&&isNumber(win.y)?{x:win.x,y:win.y}:i===0?null:cascadePos(i,Wu,zoom,vw);// a new / duplicated window: 24 px down-right of the one its ⚙ belongs to
// (its saved spot, else where it is on screen)
const placeNear=(src,i,Wu,zoom)=>{let p=src&&isNumber(src.x)&&isNumber(src.y)?{x:src.x,y:src.y}:null;if(!p&&src&&typeof document!=="undefined"){const el=document.querySelector('[data-pw-win="'+src.id+'"]');const r=el?el.getBoundingClientRect():null;if(r)p={x:Math.round(r.left),y:Math.round(r.top)};}const size=winSize();if(!p)p=cascadePos(i,Wu,zoom,size[0]);return clampPos({x:p.x+24,y:p.y+24},Wu*zoom,size[0],size[1]);};// 13.0: a new / duplicated window opens BESIDE the others: right of the
// rightmost if it fits on the screen, else below the lowest, else any free
// spot next to a window or in a corner, else 24 px down-right of `src`;
// fully on screen when it fits (else KEEP_ON px of it)
const PLACE_GAP=12;const winRect=(win,i,vw)=>{if(typeof document!=="undefined"&&document.querySelector){const el=document.querySelector('[data-pw-win="'+win.id+'"]');const r=el&&el.getBoundingClientRect?el.getBoundingClientRect():null;if(r&&r.width>0&&r.height>0)return{x:r.left,y:r.top,w:r.width,h:r.height};}const z=validScale(win.zoom)||1;const Wu=frameWidth(win.w,z,vw);const p=winSpot(win,i,Wu,z,vw)||{x:(isNumber(vw)?vw:1440)-24-Wu*z,y:2};return{x:p.x,y:p.y,w:Wu*z,h:(isNumber(win.h)?win.h:400)*z};};const placeBeside=(wins,src,Wu,Hu,zoom)=>{const size=winSize(),vw=size[0],vh=size[1];const near=()=>placeNear(src,wins.length,Wu,zoom);if(!isNumber(vw)||!isNumber(vh))return near();const W=Wu*zoom,H=Math.min((isNumber(Hu)?Hu:400)*zoom,Math.max(WIN_H_MIN*zoom,vh-2-BOTTOM_GAP));const rs=wins.map((w,i)=>winRect(w,i,vw));const free=p=>p.x>=0&&p.y>=0&&p.x+W<=vw&&p.y+H<=vh&&rs.every(r=>p.x>=r.x+r.w||p.x+W<=r.x||p.y>=r.y+r.h||p.y+H<=r.y);const cands=[];if(rs.length){const right=rs.reduce((a,r)=>r.x+r.w>a.x+a.w?r:a);const low=rs.reduce((a,r)=>r.y+r.h>a.y+a.h?r:a);cands.push({x:right.x+right.w+PLACE_GAP,y:right.y},{x:right.x+right.w+PLACE_GAP,y:2});cands.push({x:low.x,y:low.y+low.h+PLACE_GAP},{x:Math.min(low.x,vw-W),y:low.y+low.h+PLACE_GAP});const si=src?wins.findIndex(w=>w.id===src.id):-1;(si>=0?[rs[si]].concat(rs.filter((r,i)=>i!==si)):rs).forEach(r=>{cands.push({x:r.x+r.w+PLACE_GAP,y:r.y},{x:r.x-PLACE_GAP-W,y:r.y},{x:r.x-PLACE_GAP-W,y:2},{x:r.x,y:r.y+r.h+PLACE_GAP},{x:Math.min(r.x,vw-W),y:r.y+r.h+PLACE_GAP},{x:r.x+r.w-W,y:r.y-PLACE_GAP-H});});}cands.push({x:vw-24-W,y:2},{x:8,y:2},{x:8,y:vh-BOTTOM_GAP-H},{x:vw-24-W,y:vh-BOTTOM_GAP-H});const hit=cands.find(free);if(hit)return{x:Math.round(hit.x),y:Math.round(hit.y)};const p=near();return{x:W<=vw?Math.min(Math.max(p.x,0),Math.round(vw-W)):p.x,y:H<=vh?Math.min(Math.max(p.y,0),Math.round(vh-H)):p.y};};// after each render: cap the panel at the screen's bottom; the body scrolls
// (data-over tells the css a scrollbar is showing, so the content keeps its width)
const fitFrame=panelEl=>{if(!panelEl||!panelEl.parentNode||typeof window==="undefined")return;const s=Number(panelEl.parentNode.getAttribute("data-scale"))||1;const want=frameMaxHeight(window.innerHeight,panelEl.getBoundingClientRect().top,s)+"px";if(panelEl.style.maxHeight!==want)panelEl.style.maxHeight=want;const body=panelEl.lastChild;if(!body||!body.getAttribute)return;const over=body.scrollHeight>body.clientHeight+1?"1":"0";if(body.getAttribute("data-over")!==over)body.setAttribute("data-over",over);};// one gesture at a time; its window listeners go as soon as the button is up
let gesture=null;const endGesture=()=>{window.removeEventListener("mousemove",onGestureMove,true);window.removeEventListener("mouseup",onGestureUp,true);window.removeEventListener("blur",onGestureUp,false);gesture=null;};// the release after a drag also clicks whatever is under the pointer (the
// title, a tab): swallow that one click so every click handler stays plain
const swallowClick=()=>{const stop=e=>{e.stopPropagation();e.preventDefault();};window.addEventListener("click",stop,true);setTimeout(()=>window.removeEventListener("click",stop,true),0);};function onGestureMove(ev){const g=gesture;if(!g)return endGesture();if(ev.buttons===0)return onGestureUp(ev);// released outside the window: mouseup never came
const dx=ev.clientX-g.x0,dy=ev.clientY-g.y0;if(!g.active){if(Math.sqrt(dx*dx+dy*dy)<=DRAG_MIN)return;g.active=true;}ev.preventDefault();const size=winSize();if(g.kind==="move"){g.next=clampPos({x:g.left0+dx,y:g.top0+dy},g.visW,size[0],size[1]);Object.assign(g.root.style,frameStyle(g.next,g.s0,g.Wu));}else{// a resize: the draft goes to the state once per animation frame (GEO), so
// the layout reflows live; nothing is saved until the release
g.next=resizeTo(g,dx,dy,size[0],size[1]);if(!g.raf){g.raf=true;nextFrame(()=>{g.raf=false;if(gesture===g&&g.next)g.dispatch({type:"GEO",geo:Object.assign({id:g.id},g.at,g.next)});});}}}function onGestureUp(){const g=gesture;endGesture();if(!g||!g.active||g.next===null)return;swallowClick();if(g.kind==="move"){// dropped where it started: nothing to save (from the default spot, it
// stays anchored by className: its style goes back to that)
const from=g.pos0||{x:Math.round(g.left0),y:Math.round(g.top0)};if(g.next.x===from.x&&g.next.y===from.y){if(!g.pos0)Object.assign(g.root.style,frameStyle(null,g.s0,g.Wu));return;}if(g.disp)return saveDisplay(patchWin(g.disp,g.id,{x:g.next.x,y:g.next.y}),g.dispatch);// a window of _settings.display
g.dispatch({type:"SET_POS",pos:g.next});const gd=g.dispatch;(0,_uebersicht.run)(helper(["setting","position",g.next.x+","+g.next.y])).then(out=>offerUndo(out,gd)).catch(()=>{});}else{// back where it started: only the draft goes. Otherwise ONE save of the
// window's spot (a window at the default spot now stays at its left/top)
// and size; SET_DISPLAY drops the draft in the same step (no flash)
if((g.next.w===undefined||g.next.w===g.w0)&&(g.next.h===undefined||g.next.h===Math.round(g.h0))){g.dispatch({type:"GEO",geo:null});return;}const patch=Object.assign({x:g.at.x,y:g.at.y},g.next);saveDisplay(patchWin(g.disp||g.mig(),g.id,patch),g.dispatch);}}// mousedown on a handle: nothing moves until the pointer travels DRAG_MIN px.
// fr = the window's frame facts (frame()): id, Wu, disp (the display it
// belongs to; null for the 12.11 window, which saves position / scale)
const startGesture=(ev,kind,dispatch,pos,s,fr)=>{if(ev.button!==0||typeof window==="undefined")return;const root=ev.currentTarget.closest?ev.currentTarget.closest("[data-pw-win]"):null;if(!root)return;if(gesture)endGesture();const r=root.getBoundingClientRect();const f=fr||{};// a resize keeps the window's top-left where it is on screen (the default
// spot becomes that left/top); its height starts from the panel's real one
// (fit content -> a number)
const pr=root.firstChild&&root.firstChild.getBoundingClientRect?root.firstChild.getBoundingClientRect():r;gesture={kind:kind,dispatch:dispatch,root:root,x0:ev.clientX,y0:ev.clientY,left0:r.left,top0:r.top,visW:r.width,h0:pr.height/s,s0:s,pos0:pos,id:f.id||"main",Wu:isNumber(f.Wu)?f.Wu:WIDGET_W,disp:f.disp||null,mig:f.mig,w0:isNumber(f.Wu)?f.Wu:WIDGET_W,at:pos||{x:Math.round(r.left),y:Math.round(r.top)},active:false,next:null,raf:false};ev.preventDefault();// no text selection while dragging
window.addEventListener("mousemove",onGestureMove,true);window.addEventListener("mouseup",onGestureUp,true);window.addEventListener("blur",onGestureUp,false);};const resetPos=(dispatch,fr)=>{if(fr&&fr.disp)return saveDisplay(patchWin(fr.disp,fr.id,{x:undefined,y:undefined}),dispatch);dispatch({type:"SET_POS",pos:false});(0,_uebersicht.run)(helper(["setting","position","default"])).then(out=>offerUndo(out,dispatch)).catch(()=>{});};// double-click a grip: back to 664 wide (right edge), fit content (bottom
// edge), or both (corner). The 12.11 window already is both: nothing to do
const resetSize=(kind,dispatch,fr)=>{const cur=fr&&fr.disp?fr.disp.windows.find(w=>w.id===fr.id):null;if(!cur)return;const patch={};if(kind!=="b"&&cur.w!==undefined)patch.w=undefined;if(kind!=="r"&&cur.h!==undefined)patch.h=undefined;if(Object.keys(patch).length)saveDisplay(patchWin(fr.disp,fr.id,patch),dispatch);};const frameRoot=(0,_uebersicht.css)(_templateObject19());const framePanel=(0,_uebersicht.css)(_templateObject20());const frameHead=(0,_uebersicht.css)(_templateObject21());// margin/padding: the scrollbar (6 px) sits in the panel's right padding, and
// the clip edge lies in the side paddings (a sector chart's hover backdrop
// reaches 5 px past the content)
const frameBody=(0,_uebersicht.css)(_templateObject22());const moveGrip=(0,_uebersicht.css)(_templateObject23(),C.dim);// the edges: invisible strips (the right one stays clear of the scrollbar,
// which sits 4 px inside the border)
const edgeRight=(0,_uebersicht.css)(_templateObject24());const edgeBottom=(0,_uebersicht.css)(_templateObject25());const sizeGrip=(0,_uebersicht.css)(_templateObject26());// Every view goes through here: the root (position + scale), the panel
// (capped at the screen's bottom), the title row (never scrolls: the handle)
// and the body (scrolls when the widget is taller than the screen).
// state._win = the window being drawn (renderWindow); the 12.11 window takes
// its spot and zoom from the legacy keys (posOf / scaleOf), a display window
// from its own fields (or the live draft `geo` while a grip is dragged).
// A window's geometry this render (renderWindow keeps it in state._geo): zoom,
// width Wu and height Hu (unscaled px; Hu "auto" = fit content, capped at the
// screen's bottom by fitFrame), the saved spot and the on-screen one.
const winGeom=state=>{const win=state._win||{id:"main",legacy:true,idx:0,n:1};const g=state.geo&&state.geo.id===win.id?state.geo:null;const size=winSize();// (the zoom slider's draft too: it previews live, also on the 12.11 window)
const s=validScale(g&&g.zoom)||(win.legacy?scaleOf(state):validScale(win.zoom)||1);// (the draft of a grip drag wins, also over the 12.11 window's legacy keys)
const Wu=g&&isNumber(g.w)?frameWidth(g.w,s,size[0]):win.legacy&&!isNumber(win.w)?WIDGET_W:frameWidth(win.w,s,size[0]);const saved=g&&isNumber(g.x)&&isNumber(g.y)?{x:g.x,y:g.y}:win.legacy?posOf(state):winSpot(win,win.idx||0,Wu,s,size[0]);const pos=saved?clampPos(saved,Wu*s,size[0],size[1]):null;const h=g&&(g.h==="auto"||isNumber(g.h))?g.h:win.h;const top=pos?pos.y:2;const Hu=!isNumber(h)?"auto":Math.min(clampInt(h,WIN_H_MIN,WIN_H_MAX),isNumber(size[1])?Math.max(WIN_H_MIN,Math.floor((size[1]-Math.max(0,top)-BOTTOM_GAP)/s)):WIN_H_MAX);return{win:win,g:g,s:s,Wu:Wu,Hu:Hu,saved:saved,pos:pos};};const frame=(state,dispatch,head,body,hover)=>{const G=state._geo||winGeom(state);const win=G.win,s=G.s,Wu=G.Wu,saved=G.saved,pos=G.pos;const disp=win.legacy?null:state._disp||null;if(!win.idx)rememberFrame(saved,s,Wu);// mig: the display a resize of the 12.11 window starts from (its legacy keys)
const fr={id:win.id,Wu:Wu,disp:disp,mig:()=>migrateDisplay(state)};const down=kind=>ev=>startGesture(ev,kind,dispatch,pos,s,fr);// one line (12.11, per window): its own height, so a saved height is ignored
const oneLine=hasData(state)&&compactOf(state);const Hu=oneLine?"auto":G.Hu;const style=frameStyle(pos,s,Wu);const extra={};if(win.n>1){// several windows: the one last pressed is on top
style.zIndex=state.front===win.id?2:1;if(state.front!==win.id)extra.onMouseDownCapture=()=>dispatch({type:"FRONT",w:win.id});}return html("div",_extends({key:win.id,className:frameRoot+" "+themeClass(themeOf(state),opacityOf(state)),style:style,"data-pw-root":"1","data-pw-win":win.id,"data-pw-theme":themeOf(state),"data-scale":String(s)},hover,extra),html("div",{className:(0,_uebersicht.css)(_templateObject27(),panel,framePanel),ref:el=>fitFrame(el),style:isNumber(Hu)?{height:Hu+"px"}:undefined},html("div",{className:frameHead,onMouseDown:down("move")},head),html("div",{className:frameBody,style:isNumber(Hu)?{flex:"1 1 auto"}:undefined},body)),html("span",{className:moveGrip+" pw-grip",onMouseDown:down("move"),onDoubleClick:()=>resetPos(dispatch,fr),title:"drag to move the widget \xB7 double-click: back to its default spot"},"\u283F"),html("div",{className:edgeRight,"data-pw-grip":"r",onMouseDown:down("r"),onDoubleClick:()=>resetSize("r",dispatch,fr),title:"drag to change the width ("+Wu+" px) · double-click: "+WIDGET_W+" px"}),oneLine?null:html("div",{className:edgeBottom,"data-pw-grip":"b",onMouseDown:down("b"),onDoubleClick:()=>resetSize("b",dispatch,fr),title:"drag to change the height"+(isNumber(Hu)?" ("+Hu+" px)":"")+" · double-click: fit content"}),oneLine?null:html("svg",{className:sizeGrip+" pw-grip","data-pw-grip":"rb",viewBox:"0 0 12 12",onMouseDown:down("rb"),onDoubleClick:()=>resetSize("rb",dispatch,fr)},html("title",null,"drag to resize ("+Wu+" × "+(isNumber(Hu)?Hu:"fit")+") · double-click: "+WIDGET_W+" wide, fit content"),html("path",{d:"M11 4 L4 11 M11 8 L8 11",stroke:C.dim,strokeWidth:"1.2",strokeLinecap:"round"})));};// ------------------------------------------------------------------ graph
// Nice round tick values covering [mn, mx], recomputed every render.
const crisp=v=>Math.round(v)+0.5;// 1px lines on pixel centres
const LINE_STYLE={strokeLinejoin:"round",strokeLinecap:"round",shapeRendering:"geometricPrecision"};const SURFACE="var(--pw-surface)";// the panel colour: the ring that keeps a marker dot legible on its line
// index of the point nearest to time t (times ascending)
const nearestIdx=(times,t)=>{let lo=0,hi=times.length-1;if(hi<0)return-1;while(hi-lo>1){const mid=lo+hi>>1;if(times[mid]<t)lo=mid;else hi=mid;}return Math.abs(times[lo]-t)<=Math.abs(times[hi]-t)?lo:hi;};// pointer -> 0..1 across an SVG's plot area (W = the svg's drawn width)
const plotFraction=(ev,W,padL,padR)=>{const svg=ev.currentTarget.ownerSVGElement||ev.currentTarget;const rect=svg.getBoundingClientRect();const px=(ev.clientX-rect.left)*(W/(rect.width||W));return Math.max(0,Math.min(1,(px-padL)/(W-padL-padR)));};// the pointer moves far more often than the widget needs to redraw
// (one queue per window: dispatch.w, see renderWindow)
const hoverQ={};const queueHover=(dispatch,t)=>{const q=hoverQ[dispatch.w||""]||(hoverQ[dispatch.w||""]={raf:0,t:null});q.t=t;if(q.raf)return;q.raf=requestAnimationFrame(()=>{q.raf=0;dispatch({type:"HOVER_PT",t:q.t});});};// hairline snapped to a data point + a ringed dot on the line
const Crosshair=({cx,cy,top,bottom,strong,small})=>html("g",{pointerEvents:"none"},html("line",{x1:crisp(cx),y1:top,x2:crisp(cx),y2:bottom,stroke:strong?C.ink:C.dim,strokeWidth:"1",opacity:strong?0.5:0.75,shapeRendering:"crispEdges"}),html("circle",{cx:cx,cy:cy,r:small?2.2:3,fill:C.ink,stroke:SURFACE,strokeWidth:small?1.5:2}));const niceTicks=(mn,mx,target)=>{const span=mx-mn;if(span<=0)return{ticks:[mn],step:1};const step0=span/(target||4);const mag=Math.pow(10,Math.floor(Math.log10(step0)));const norm=step0/mag;const step=(norm<1.5?1:norm<3?2:norm<7?5:10)*mag;const ticks=[];for(let v=Math.ceil(mn/step)*step;v<=mx+1e-9;v+=step){ticks.push(v);}return{ticks:ticks,step:step};};// runs of one style: real (recorded or ≈ rebuilt: one solid line, 12.10) or
// simulated (backtest: solid too, only lighter). The segment joining two runs
// takes the later run's style, except after a simulated run: the step into
// the first real day is still part of the simulation. Runs share their joint
// point, so the line has no gap there.
const splitRuns=pts=>{const runs=[];let cur=null;pts.forEach(p=>{const s=!!p.sim;if(!cur||cur.sim!==s){cur={sim:s,pts:[]};runs.push(cur);}cur.pts.push(p);});for(let i=1;i<runs.length;i++){const prevPts=runs[i-1].pts;if(runs[i-1].sim&&!runs[i].sim)prevPts.push(runs[i].pts[0]);else runs[i].pts.unshift(prevPts[prevPts.length-1]);}return runs;};// bench (optional): the benchmark's value at each point of `series` (null = unknown),
// drawn as a thin solid grey line under the portfolio's; boughtT: the first real day, marked when simulated points precede it
const Graph=({series,width,height,yTicks,hoverT,markT,onHover,onPick,bench,boughtT})=>{const W=width||296,H=height||74;const PADL=42,PADR=4,PADT=5,PADB=5;if(!series||series.length<2){return html("div",{className:(0,_uebersicht.css)(_templateObject28(),H+AXIS_H,C.dim)},"collecting history\u2026");}const t0=series[0].t,t1=series[series.length-1].t;let vMin=Infinity,vMax=-Infinity;series.forEach(p=>{if(p.v<vMin)vMin=p.v;if(p.v>vMax)vMax=p.v;});const benchOn=!!(bench&&bench.length===series.length);if(benchOn)bench.forEach(v=>{if(!isNum(v))return;if(v<vMin)vMin=v;if(v>vMax)vMax=v;});// a nearly flat line keeps some height (0.2% of the value, at least 1): a
// $36,507 day that moved $0.50 gets "$36,480 … $36,540", not "36507.50"
const minSpan=Math.max(1,Math.max(Math.abs(vMax),Math.abs(vMin))*0.002);if(vMax-vMin<minSpan){const mid=(vMax+vMin)/2;vMax=mid+minSpan/2;vMin=mid-minSpan/2;}const span=vMax-vMin;vMax+=span*0.06;vMin-=span*0.06;const x=t=>PADL+(t-t0)/Math.max(1,t1-t0)*(W-PADL-PADR);const y=v=>H-PADB-(v-vMin)/(vMax-vMin)*(H-PADT-PADB);const nt=niceTicks(vMin,vMax,yTicks||4);const runs=splitRuns(series);const areaPath="M"+x(series[0].t)+","+(H-PADB)+series.map(p=>" L"+x(p.t).toFixed(1)+","+y(p.v).toFixed(1)).join("")+" L"+x(t1).toFixed(1)+","+(H-PADB)+" Z";// the benchmark line, broken where it has no value
const benchLines=[];if(benchOn){let cur=[];series.forEach((p,i)=>{if(isNum(bench[i]))cur.push(x(p.t).toFixed(1)+","+y(bench[i]).toFixed(1));else if(cur.length){benchLines.push(cur);cur=[];}});if(cur.length)benchLines.push(cur);}const boughtShown=isNum(boughtT)&&series[0].sim&&boughtT>t0&&boughtT<=t1;const times=series.map(p=>p.t);const timeAt=ev=>series[nearestIdx(times,t0+plotFraction(ev,W,PADL,PADR)*(t1-t0))].t;const crossAt=(t,strong)=>{if(t===null||t===undefined||t<t0-1||t>t1+1)return null;const p=series[nearestIdx(times,t)];return html(Crosshair,{cx:x(p.t),cy:y(p.v),top:PADT,bottom:H-PADB,strong:strong});};const xTicks=TICK_FRACTIONS.map(f=>{const t=t0+f*(t1-t0);return{x:x(t),label:axisLabel(t,t0,t1)};});return html("svg",{width:W,height:H+AXIS_H},nt.ticks.map(tv=>html("g",{key:tv},html("line",{x1:PADL,y1:crisp(y(tv)),x2:W-PADR,y2:crisp(y(tv)),stroke:C.grid,strokeWidth:"1",shapeRendering:"crispEdges"}),html("text",{x:PADL-5,y:crisp(y(tv))+3,textAnchor:"end",fill:C.dim,fontSize:"8",fontFamily:"\"SF Mono\", Menlo, monospace"},fmtAxis(tv,nt.step)))),html(XLabels,{ticks:xTicks,y:H+AXIS_H-3}),html("path",{d:areaPath,fill:C.line,opacity:paletteNow().areaAlpha}),benchLines.map((pts,i)=>pts.length>1?html("polyline",_extends({key:"b"+i,points:pts.join(" "),fill:"none",stroke:C.bench,strokeWidth:"1"},LINE_STYLE)):null),runs.map((r,i)=>html("polyline",_extends({key:i,points:r.pts.map(p=>x(p.t).toFixed(1)+","+y(p.v).toFixed(1)).join(" "),fill:"none",stroke:C.line,strokeWidth:"1.25",opacity:r.sim?0.45:1},LINE_STYLE))),boughtShown?html("g",{pointerEvents:"none"},html("line",{x1:crisp(x(boughtT)),y1:PADT,x2:crisp(x(boughtT)),y2:H-PADB,stroke:C.dim,strokeWidth:"1",opacity:"0.7",shapeRendering:"crispEdges"}),html("text",{x:x(boughtT)+(x(boughtT)>W-90?-4:4),y:PADT+8,fontSize:"8",textAnchor:x(boughtT)>W-90?"end":"start",fill:C.dim},"you bought here")):null,vMin<0&&vMax>0?html("line",{x1:PADL,y1:crisp(y(0)),x2:W-PADR,y2:crisp(y(0)),stroke:C.dim,strokeWidth:"1",opacity:"0.6",shapeRendering:"crispEdges"}):null,crossAt(markT,true),crossAt(hoverT,false),onHover?html("rect",{x:PADL,y:0,width:W-PADL-PADR,height:H,fill:"transparent",pointerEvents:"all",style:{cursor:"crosshair"},onMouseMove:ev=>onHover(timeAt(ev)),onMouseLeave:()=>onHover(null),onClick:ev=>onPick(timeAt(ev))}):null);};const Spark=({values,w})=>{const W=w||LAYOUT_K.SPARK,H=14;// w: narrower when a holding row also carries a drift badge (12.10)
if(!values||values.length<2)return html("svg",{width:W,height:H});let mn=Infinity,mx=-Infinity;values.forEach(v=>{if(v<mn)mn=v;if(v>mx)mx=v;});if(mx===mn){mx+=1;mn-=1;}const pts=values.map((v,i)=>(i/(values.length-1)*W).toFixed(1)+","+(H-1-(v-mn)/(mx-mn)*(H-2)).toFixed(1)).join(" ");return html("svg",{width:W,height:H},html("polyline",_extends({points:pts,fill:"none",stroke:C.line,strokeWidth:"1",opacity:"0.75"},LINE_STYLE)));};// ------------------------------------------------------------------ sectors
// Small multiples: one chart per sector plus one for the whole portfolio, all
// on the same % scale, so shapes and sizes compare at a glance. No colour
// coding — past ~8 series, hues stop being tellable apart, so position and a
// title carry identity. Points are spaced evenly (one per trading bar), which
// leaves nights and weekends out instead of drawing them as flat steps. The
// crosshair runs through every chart at once, and each title then shows its
// value at that moment. Click a chart to enlarge it.
const facetCss=(0,_uebersicht.css)(_templateObject29());const isNum=v=>v!==null&&v!==undefined;const lastNum=ser=>{for(let i=ser.length-1;i>=0;i--)if(isNum(ser[i]))return ser[i];return null;};const SectorGrid=({data,width,height,cols:colsIn,hoverT,markT,scaleMode,order,rangeWords,onHover,onOpen})=>{if(!data||!data.t||data.t.length<2){return html("div",{className:(0,_uebersicht.css)(_templateObject30(),height||LAYOUT_K.GRAPH_H,C.dim)},"no sector history for this range yet");}const times=data.t;const n=times.length;const themes=(data.themes||[]).slice();if(order==="best"){themes.sort((a,b)=>{const va=lastNum(a.pct),vb=lastNum(b.pct);return(isNum(vb)?vb:-1e9)-(isNum(va)?va:-1e9);});}const facets=[{name:"portfolio",pct:data.total||[],whole:true}].concat(themes);// columns from the window's width (layoutFor: 4 at the 12.11 width)
const cols=colsIn||4,GAP=LAYOUT_K.SECTOR_GAP,H=LAYOUT_K.SECTOR_H;const w=Math.floor((width-GAP*(cols-1))/cols);let gMin=0,gMax=0;facets.forEach(f=>f.pct.forEach(v=>{if(!isNum(v))return;if(v<gMin)gMin=v;if(v>gMax)gMax=v;}));const hovering=isNum(hoverT);const activeT=hovering?hoverT:markT;const ai=isNum(activeT)&&activeT>=times[0]-1&&activeT<=times[n-1]+1?nearestIdx(times,activeT):-1;const xi=i=>1+i/Math.max(1,n-1)*(w-2);const timeAt=ev=>times[Math.round(plotFraction(ev,w,1,1)*(n-1))];return html("div",{style:{display:"flex",flexWrap:"wrap",columnGap:GAP+"px",rowGap:"9px"}},facets.map(f=>{let lo=0,hi=0;f.pct.forEach(v=>{if(!isNum(v))return;if(v<lo)lo=v;if(v>hi)hi=v;});let mn=scaleMode==="own"?lo:gMin,mx=scaleMode==="own"?hi:gMax;if(mx===mn){mx+=1;mn-=1;}const padv=(mx-mn)*0.08;mx+=padv;mn-=padv;const y=v=>H-2-(v-mn)/(mx-mn)*(H-4);const pts=[];let lastI=-1;f.pct.forEach((v,i)=>{if(isNum(v)){pts.push(xi(i).toFixed(1)+","+y(v).toFixed(1));lastI=i;}});const line=pts.join(" ");const shown=ai>=0?f.pct[ai]:lastNum(f.pct);const label=f.whole?"whole portfolio":f.name;return html("div",{key:f.name,className:facetCss,style:{width:w+"px"},onClick:()=>onOpen(f.whole?"portfolio":f.name),title:label+": "+pct(lastNum(f.pct))+" "+rangeWords+" (low "+pct(lo)+", high "+pct(hi)+") — click to enlarge"},html("div",{style:{display:"flex",alignItems:"baseline"}},html("span",{style:{flex:1,minWidth:0,fontSize:9.5,color:C.ink,opacity:f.whole?1:0.85,fontWeight:f.whole?600:400,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}},label),html("span",{className:mono,style:{fontSize:9.5,marginLeft:6,color:upDown(shown||0)}},pct(shown))),html("svg",{width:w,height:H,style:{display:"block",marginTop:2}},html("line",{x1:0,y1:crisp(y(0)),x2:w,y2:crisp(y(0)),stroke:C.dim,strokeWidth:"1",opacity:"0.45",shapeRendering:"crispEdges"}),pts.length>1?html("path",{d:"M"+xi(0).toFixed(1)+","+y(0).toFixed(1)+" L"+line.replace(/ /g," L")+" L"+xi(lastI).toFixed(1)+","+y(0).toFixed(1)+" Z",fill:C.line,opacity:paletteNow().areaAlpha}):null,html("polyline",_extends({points:line,fill:"none",stroke:C.line,strokeWidth:"1.25"},LINE_STYLE)),ai<0&&lastI>=0?html("circle",{cx:xi(lastI),cy:y(f.pct[lastI]),r:"1.9",fill:C.ink,stroke:SURFACE,strokeWidth:"1",pointerEvents:"none"}):null,ai>=0&&isNum(f.pct[ai])?html(Crosshair,{cx:xi(ai),cy:y(f.pct[ai]),top:0,bottom:H,strong:!hovering,small:true}):null,html("rect",{x:0,y:0,width:w,height:H,fill:"transparent",pointerEvents:"all",onMouseMove:ev=>onHover(timeAt(ev)),onMouseLeave:()=>onHover(null)})));}));};// One sector enlarged: its line against the whole portfolio (grey, for
// reference) on a % axis, with the same snapping crosshair. Emphasis rather
// than colour coding: the sector is the subject, the portfolio is context.
const sectorSeriesOf=(data,name)=>{if(!data)return null;if(name==="portfolio")return data.total||null;const th=(data.themes||[]).find(t=>t.name===name);return th?th.pct:null;};const LineKey=({color})=>html("svg",{width:14,height:6,style:{verticalAlign:"middle",marginRight:4}},html("line",{x1:1,y1:3,x2:13,y2:3,stroke:color,strokeWidth:"2",strokeLinecap:"round"}));const SectorFocus=({data,name,width,height,hoverT,markT,onHover,onPick})=>{const main=sectorSeriesOf(data,name);const W=width,H=height,PADL=42,PADR=4,PADT=5,PADB=5;if(!main||!data.t||data.t.length<2){return html("div",{className:(0,_uebersicht.css)(_templateObject31(),H,C.dim)},"no history for ",name," over this range");}const times=data.t;const n=times.length;const ref=name==="portfolio"?null:data.total;let mn=0,mx=0;[main,ref].forEach(ser=>(ser||[]).forEach(v=>{if(!isNum(v))return;if(v<mn)mn=v;if(v>mx)mx=v;}));if(mx===mn){mx+=1;mn-=1;}const span=mx-mn;mx+=span*0.06;mn-=span*0.06;const t0=times[0],t1=times[n-1];// one evenly spaced step per trading bar: nights and weekends take no room
const xi=i=>PADL+i/Math.max(1,n-1)*(W-PADL-PADR);const y=v=>H-PADB-(v-mn)/(mx-mn)*(H-PADT-PADB);const nt=niceTicks(mn,mx,4);const tickLabel=v=>(v>0?"+":v<0?"−":"")+Math.abs(v).toFixed(nt.step<1?1:0)+"%";const pointsOf=ser=>{const pts=[];ser.forEach((v,i)=>{if(isNum(v))pts.push(xi(i).toFixed(1)+","+y(v).toFixed(1));});return pts.join(" ");};const mainLine=pointsOf(main);const hovering=isNum(hoverT);const activeT=hovering?hoverT:markT;const ai=isNum(activeT)&&activeT>=t0-1&&activeT<=t1+1?nearestIdx(times,activeT):-1;const timeAt=ev=>times[Math.round(plotFraction(ev,W,PADL,PADR)*(n-1))];const xTicks=TICK_FRACTIONS.map(f=>{const i=Math.round(f*(n-1));return{x:xi(i),label:axisLabel(times[i],t0,t1)};});return html("svg",{width:W,height:H+AXIS_H},html(XLabels,{ticks:xTicks,y:H+AXIS_H-3}),nt.ticks.map(tv=>html("g",{key:tv},html("line",{x1:PADL,y1:crisp(y(tv)),x2:W-PADR,y2:crisp(y(tv)),stroke:C.grid,strokeWidth:"1",shapeRendering:"crispEdges"}),html("text",{x:PADL-5,y:crisp(y(tv))+3,textAnchor:"end",fill:C.dim,fontSize:"8",fontFamily:"\"SF Mono\", Menlo, monospace"},tickLabel(tv)))),html("line",{x1:PADL,y1:crisp(y(0)),x2:W-PADR,y2:crisp(y(0)),stroke:C.dim,strokeWidth:"1",opacity:"0.6",shapeRendering:"crispEdges"}),html("path",{d:"M"+xi(0).toFixed(1)+","+y(0).toFixed(1)+" L"+mainLine.replace(/ /g," L")+" L"+xi(n-1).toFixed(1)+","+y(0).toFixed(1)+" Z",fill:C.line,opacity:paletteNow().areaAlpha}),ref?html("polyline",_extends({points:pointsOf(ref),fill:"none",stroke:C.dim,strokeWidth:"1.25",opacity:"0.9"},LINE_STYLE)):null,html("polyline",_extends({points:mainLine,fill:"none",stroke:C.line,strokeWidth:"1.5"},LINE_STYLE)),ai>=0&&ref&&isNum(ref[ai])?html("circle",{cx:xi(ai),cy:y(ref[ai]),r:"2.4",fill:C.dim,stroke:SURFACE,strokeWidth:"1.5",pointerEvents:"none"}):null,ai>=0&&isNum(main[ai])?html(Crosshair,{cx:xi(ai),cy:y(main[ai]),top:PADT,bottom:H-PADB,strong:!hovering}):null,html("rect",{x:PADL,y:0,width:W-PADL-PADR,height:H,fill:"transparent",pointerEvents:"all",style:{cursor:"crosshair"},onMouseMove:ev=>onHover(timeAt(ev)),onMouseLeave:()=>onHover(null),onClick:ev=>onPick(timeAt(ev))}));};const VolBadge=({pct:p,score})=>html("span",{title:volTip(p,score),className:mono,style:{display:"inline-block",minWidth:14,textAlign:"center",fontSize:8.5,lineHeight:"11px",borderRadius:3,color:volColor(score),border:"1px solid "+(score?volColor(score)+"66":C.faint)}},score||"–");// Drift from the target allocation (12.10), next to the vol badge. The row keeps
// its width: the sparkline gives up DRIFT_W. A row covered by a sector target
// shows its sector's drift (fainter solid border); no target at all -> empty spacer.
const DRIFT_W=30;// badge 28 + 2 margin
// one cell of the holdings list's legend line (13.5)
const LEGEND_CELL={fontSize:7,letterSpacing:"0.08em",whiteSpace:"nowrap",overflow:"hidden"};const DriftBadge=({p,d})=>{const b=bucketFor(d,p.targetKey);const own=typeof p.driftPct==="number"&&isFinite(p.driftPct);const sec=!own&&!!b&&b.kind==="sector"&&typeof b.driftPct==="number"&&isFinite(b.driftPct);if(!own&&!sec)return html(DriftSpacer,null);const dp=own?p.driftPct:b.driftPct;const over=b?b.state==="over":false;const color=over||dp>0?C.orange:C.dim;const gap=Math.abs(dp)<0.05?"on target":fmtPts(Math.abs(dp)).replace("+","")+" pts "+(dp>0?"over":"under");return html("span",{title:own?p.ticker+": "+p.weightPct+"% of the portfolio, target "+fmtTarget(p.targetPct)+" (±"+bandOf(d)+" pt) — "+gap:b.key+" sector: "+fmtPts(dp)+" pts — "+b.weightPct+"% of the portfolio, target "+fmtTarget(b.targetPct)+" (±"+bandOf(d)+" pt), "+gap+"; "+p.ticker+" counts toward it",className:mono,style:{display:"inline-block",width:28,marginLeft:2,boxSizing:"border-box",textAlign:"center",fontSize:8,lineHeight:"11px",borderRadius:3,whiteSpace:"nowrap",overflow:"hidden",color:color,border:"1px solid "+(color===C.dim?C.faint:color+(sec?"33":"66")),opacity:!over&&dp>0?0.55:1}},fmtPts(dp));};const DriftSpacer=()=>html("span",{style:{display:"inline-block",width:DRIFT_W}});const VolMeter=({score})=>html("span",{style:{display:"inline-flex",gap:1.5,verticalAlign:"middle"}},[1,2,3,4,5,6,7,8,9,10].map(i=>html("span",{key:i,style:{width:5,height:6,borderRadius:1,background:score&&i<=score?volColor(score):C.faint}})));// ------------------------------------------------------------------ heatmap
// Bruls et al. "Squarified Treemaps".
const squarify=(items,x,y,w,h)=>{const total=items.reduce((s,i)=>s+i.value,0);if(total<=0||w<=0||h<=0)return[];const scaled=items.map(it=>Object.assign({},it,{area:it.value/total*w*h})).filter(i=>i.area>0).sort((a,b)=>b.area-a.area);const out=[];let cx=x,cy=y,cw=w,ch=h;let row=[];const worst=(r,len)=>{const s=r.reduce((a,q)=>a+q.area,0);let mx=-Infinity,mn=Infinity;for(const q of r){if(q.area>mx)mx=q.area;if(q.area<mn)mn=q.area;}return Math.max(len*len*mx/(s*s),s*s/(len*len*mn));};const layoutRow=r=>{const s=r.reduce((a,q)=>a+q.area,0);// float drift can leave a ~0-size strip; dividing by it gives NaN geometry
if(s<=0||cw<=0.5||ch<=0.5)return;if(cw>=ch){const rw=s/ch;if(!isFinite(rw)||rw<=0)return;let ry=cy;for(const q of r){const rh=q.area/rw;out.push(Object.assign({},q,{x:cx,y:ry,w:rw,h:rh}));ry+=rh;}cx+=rw;cw-=rw;}else{const rh=s/cw;if(!isFinite(rh)||rh<=0)return;let rx=cx;for(const q of r){const qw=q.area/rh;out.push(Object.assign({},q,{x:rx,y:cy,w:qw,h:rh}));rx+=qw;}cy+=rh;ch-=rh;}};for(const it of scaled){const len=Math.min(cw,ch);if(row.length&&worst(row,len)<worst(row.concat([it]),len)){layoutRow(row);row=[it];}else{row.push(it);}}if(row.length)layoutRow(row);return out;};// Apple system palette; saturates toward full green/red at the cap for the
// active range, so a quiet day isn't a wall of neon.
const neutralOf=()=>paletteNow().neutral;// the resting tile, per theme
const GREEN=[48,209,88];const RED=[255,69,58];const AMBER=[245,180,60];const PINK=[236,72,153];const RANGE_CAP={"1H":2.5,"1D":4,"1W":8,"1M":18,"1Y":60};const mixc=(a,b,t)=>a.map((v,i)=>Math.round(v+(b[i]-v)*t));const rgb=c=>"rgb("+c[0]+", "+c[1]+", "+c[2]+")";const tileColor=(p,range)=>{const cap=RANGE_CAP[range]||4;const t=Math.min(1,Math.abs(p)/cap);const e=Math.pow(t,0.75);return rgb(mixc(neutralOf(),p>=0?GREEN:RED,0.18+0.82*e));};// VOL mode: calm = the neutral tile, rising through amber to pink
const volTileColor=score=>{if(!score)return rgb(neutralOf());if(score<=6)return rgb(mixc(neutralOf(),AMBER,0.08+(score-1)/5*0.62));return rgb(mixc(AMBER,PINK,(score-6)/4*0.85));};// DRIFT mode (12.10): over target = orange, under = blue, full at 5 pts,
// half as strong while the bucket is still within its band
const ORANGE=[255,159,10];const BLUE=[10,132,255];const driftTileColor=b=>{if(!b||typeof b.driftPct!=="number"||!isFinite(b.driftPct))return rgb(neutralOf());const e=Math.pow(Math.min(1,Math.abs(b.driftPct)/5),0.75);const k=(0.18+0.82*e)*(b.state==="ok"?0.5:1);return rgb(mixc(neutralOf(),b.driftPct>=0?ORANGE:BLUE,k));};const driftTip=b=>!b?"no target":(b.kind==="sector"?b.key+" sector: ":"")+"drift "+fmtPts(b.driftPct)+" pts vs target "+fmtTarget(b.targetPct);const changeFor=(p,range)=>{if(p.changes&&typeof p.changes[range]==="number")return p.changes[range];return typeof p.dayChangePct==="number"?p.dayChangePct:0;};const SECTOR_HEADER=14;const TILE_GAP=1.25;const Heatmap=({positions,range,w,h,onSelect,d})=>{const MAP_W=w||LAYOUT_K.MAP_MIN;const MAP_H=h||LAYOUT_K.MAP_MIN;const isVol=range==="VOL";const isDrift=range==="DRIFT"&&targetsOn(d);// the caller maps a stale DRIFT to 1D without targets
const byTheme={};for(const p of positions){const th=p.theme||"Other";if(!byTheme[th])byTheme[th]={name:th,value:0,positions:[]};byTheme[th].value+=p.value||0;byTheme[th].positions.push(p);}const sectorRects=squarify(Object.values(byTheme),0,0,MAP_W,MAP_H);const tiles=[];const labels=[];for(const sr of sectorRects){const showHeader=sr.w>56&&sr.h>52;const headerH=showHeader?SECTOR_HEADER:0;if(showHeader){labels.push(html("div",{key:"lbl-"+sr.name,"data-pw-mapcap":"1",style:{position:"absolute",left:sr.x+5+"px",top:sr.y+3+"px",maxWidth:sr.w-10+"px",fontSize:"8px",fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",color:C.mapCap,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",pointerEvents:"none"}},sr.name));}const items=sr.positions.map(p=>Object.assign({},p,{value:p.value||0}));let inner=squarify(items,sr.x,sr.y+headerH,sr.w,sr.h-headerH);// 13.6: two or more slivers (too thin for a ticker) in a sector become one "+n" tile
const thin=inner.filter(r=>!(r.w>LAYOUT_K.SLIVER_W&&r.h>LAYOUT_K.SLIVER_H));if(thin.length>=2&&thin.length<inner.length){const gone={};thin.forEach(r=>{gone[r.ticker]=true;});const val=thin.reduce((a,r)=>a+(r.value||0),0);const chg=val>0?thin.reduce((a,r)=>a+changeFor(r,range)*(r.value||0),0)/val:thin.reduce((a,r)=>a+changeFor(r,range),0)/thin.length;const vs=thin.filter(r=>isNumber(r.volScore)&&r.volScore>0);const changes={};changes[range]=chg;const others={ticker:"+"+thin.length,others:thin.map(r=>r.ticker),value:val,weightPct:Math.round(thin.reduce((a,r)=>a+(Number(r.weightPct)||0),0)*10)/10,changes:changes,dayChangePct:chg,plPct:null,volScore:vs.length?Math.round(vs.reduce((a,r)=>a+r.volScore,0)/vs.length):0};inner=squarify(items.filter(p=>!gone[p.ticker]).concat([others]),sr.x,sr.y+headerH,sr.w,sr.h-headerH);}for(const r of inner){const chg=changeFor(r,range);const minSide=Math.min(r.w,r.h);const showTicker=r.w>30&&r.h>16;const showSub=r.w>40&&r.h>30;const tickerFs=Math.max(8,Math.min(16,minSide*0.24));const subFs=Math.max(7.5,Math.min(11,minSide*0.16));const bk=isDrift&&!r.others?bucketFor(d,r.targetKey):null;// 13.6: a ticker-only tile wide enough for the change too shows both on one row
const oneRow=showTicker&&!showSub&&r.w>=(String(r.ticker).length+7)*subFs*0.62+6;let tip=r.others?plural(r.others.length,"small holding")+": "+r.others.join(", ")+"\n"+money(r.value)+" · "+r.weightPct+"% of portfolio"+(isVol?"\naverage volatility score "+r.volScore+"/10":"\ntogether "+pct(chg)+" ("+(isDrift?"1D":range)+")"):r.ticker+"  "+(isDrift?driftTip(bk):isVol?"volatility "+(r.volPct===null?"—":r.volPct+"%/yr"):pct(chg)+" ("+range+")")+"\n"+money(r.value)+" · "+r.weightPct+"% of portfolio"+(r.volScore?"\nvolatility score "+r.volScore+"/10 ("+VOL_LABEL[r.volScore]+")":"");if(!r.others&&r.plPct!==null&&r.plPct!==undefined){tip+="\nP&L "+(r.basisDerived?"≈":"")+pct(r.plPct);}if(!r.others&&r.undated===true)tip+="\nundated: no purchase date, counted as held for the whole graph";const hi52=r.others?null:high52Tip(r);if(hi52)tip+="\n"+hi52;tiles.push(html("div",{key:r.others?"others:"+sr.name:r.ticker,title:tip,"data-pw-map-others":r.others?r.others.length:undefined,onClick:onSelect&&!r.others?()=>onSelect(r.ticker):null,style:{position:"absolute",cursor:onSelect&&!r.others?"pointer":"default",left:r.x+TILE_GAP+"px",top:r.y+TILE_GAP+"px",width:Math.max(0,r.w-TILE_GAP*2)+"px",height:Math.max(0,r.h-TILE_GAP*2)+"px",background:isDrift?r.others?neutralOf():driftTileColor(bk):isVol?volTileColor(r.volScore):tileColor(chg,range),borderRadius:Math.min(6,Math.max(2,minSide*0.12))+"px",display:"flex",flexDirection:oneRow?"row":"column",columnGap:oneRow?3:undefined,alignItems:"center",justifyContent:"center",overflow:"hidden",boxShadow:"inset 0 0.5px 0 rgba(var(--pw-fg),0.07)"}},showTicker?html("div",{style:{fontSize:tickerFs+"px",fontWeight:700,color:"var(--pw-tile-ink)",lineHeight:1.1,textShadow:"var(--pw-tile-shadow)"}},r.ticker):null,showSub||oneRow?html("div",{style:{fontSize:subFs+"px",fontWeight:500,color:"var(--pw-tile-sub)",lineHeight:1.2,textShadow:"var(--pw-tile-shadow)"}},isDrift?bk?fmtPts(bk.driftPct)+" pt":"—":isVol?r.volScore?"vol "+r.volScore:"—":pct(chg)):null));}}return html("div",{style:{position:"relative",width:MAP_W+"px",height:MAP_H+"px",marginTop:"6px",borderRadius:"10px",overflow:"hidden"}},tiles,labels);};// drift: the "drift" tab (12.10, only with targets); range: the mode shown
const MapTabs=({state,dispatch,extra,drift,range})=>html("span",null,RANGES.concat(drift?["VOL","DRIFT"]:["VOL"]).map(r=>html("span",{key:r,className:r===(range||state.mapRange)?(0,_uebersicht.css)(_templateObject32(),tabBtn,tabActive):tabBtn,title:r==="VOL"?"color tiles by volatility score":r==="DRIFT"?"color tiles by drift from your target allocation: orange = over, blue = under":"color tiles by the "+r+" move",onClick:()=>dispatch({type:"SET_MAP_RANGE",range:r})},r==="VOL"?"vol":r==="DRIFT"?"drift":r)),extra);// ------------------------------------------------------------------ buy / sell
const inputCss=(0,_uebersicht.css)(_templateObject33(),C.ink);// Yahoo symbols: MSFT, BRK-B, SHOP.TO, 0700.HK, M&M.NS, BTC-USD, GC=F, ^GSPC
const dayInputCss=(0,_uebersicht.css)(_templateObject34(),C.ink);// ---- the backtest (12.6+ data.json): before the first purchase the longer
// tabs show today's holdings priced back ("simulated"), as its own series
// that meets the real one at the first real day (d.backtest.anchor)
const btOf=d=>{const bt=d&&d.backtest;return bt&&typeof bt==="object"&&bt.anchor&&typeof bt.anchor.t==="number"&&typeof bt.anchor.v==="number"&&Array.isArray(bt.tabs)?bt:null;};const btTabsOf=d=>{const bt=btOf(d);return bt?BT_RANGES.map(k=>bt.tabs.find(tb=>tb&&tb.key===k&&typeof tb.start==="number")).filter(tb=>!!tb):[];};const btTab=(d,key)=>btTabsOf(d).find(tb=>tb.key===key)||null;let btModeNow="held";// the mode shown (set every render; the date box reads it)
const btModeBy={};// …per window (dispatch.w): the date box's answers can come after another window's render
const btModeFor=dispatch=>btModeBy[dispatch&&dispatch.w||""]||"held";// a tab's simulated points before the anchor: [{t, v, sim, bi}] (bi = benchmark level)
// (memo per series object and mode: every window, the date box and simStart
// share one list per data.json; callers never change it)
const simMemo=typeof WeakMap==="function"?new WeakMap():null;const simPoints=(d,key,mode)=>{const bt=btOf(d);const ser=bt&&bt.series&&bt.series[key];if(!ser||!Array.isArray(ser.t))return[];const mk=String(mode)+"|"+bt.anchor.t;const memo=simMemo?simMemo.get(ser)||{}:null;if(memo&&memo[mk])return memo[mk];const vals=Array.isArray(ser[mode])?ser[mode]:[];const idx=Array.isArray(ser.idx)?ser.idx:[];const out=[];ser.t.forEach((t,i)=>{if(typeof t==="number"&&t<bt.anchor.t-1&&typeof vals[i]==="number"&&isFinite(vals[i]))out.push({t:t,v:vals[i],sim:true,bi:typeof idx[i]==="number"?idx[i]:null});});if(memo){memo[mk]=out;simMemo.set(ser,memo);}return out;};// a history range with the index level (bi) of each point, shared by the
// windows showing the same range (memo per points list and index list)
const benchMemo=typeof WeakMap==="function"?new WeakMap():null;const withBench=(pts,idx)=>{const m=benchMemo?benchMemo.get(pts):null;if(m&&m.idx===idx)return m.out;const out=pts.map((p,i)=>typeof idx[i]==="number"?Object.assign({},p,{bi:idx[i]}):p);if(benchMemo)benchMemo.set(pts,{idx:idx,out:out});return out;};// the smallest backtest tab reaching back to t, else the one reaching furthest
const btTabFor=(d,t)=>{const tabs=btTabsOf(d);return tabs.find(tb=>tb.start<=t+1)||tabs.reduce((a,tb)=>!a||tb.start<a.start?tb:a,null);};// a day before the real day rows: the simulated point at or before it
const simDay=(q,d)=>{const tabs=btTabsOf(d).filter(tb=>isoOf(tb.start)<=q);for(let i=0;i<tabs.length;i++){const pts=simPoints(d,tabs[i].key,btModeNow);if(!pts.length)continue;let p=pts[0];for(let j=0;j<pts.length&&isoOf(pts[j].t)<=q;j++)p=pts[j];const iso=isoOf(p.t);return{mark:{t:p.t,v:p.v,d:iso,approx:false,sim:true,bi:p.bi,asked:iso!==q?q:null},range:tabs[i].key};}return null;};// the earliest simulated day on any backtest tab (ISO), or null
const simStart=d=>btTabsOf(d).reduce((best,tb)=>{const pts=simPoints(d,tb.key,btModeNow);const iso=pts.length?isoOf(pts[0].t):null;return iso&&(!best||iso<best)?iso:best;},null);// the shortest graph range that still contains time t (before the first
// purchase: the smallest backtest tab reaching back that far)
const pickRange=(t,d)=>{const h=d.history||{};const bt=btOf(d);if(bt&&t<bt.anchor.t-1){const tb=btTabFor(d,t);if(tb)return tb.key;}const has=r=>h[r]&&h[r].length&&t>=h[r][0].t-1;for(const r of["1D","1W","1M","1Y"])if(has(r))return r;return h.ALL&&h.ALL.length?"ALL":"1Y";};const dayMark=(row,asked)=>({t:row[1],v:row[2],d:row[0],approx:!!row[3],asked:asked||null,bi:typeof row[4]==="number"?row[4]:null,// row[4]: the benchmark that day (12.6+)
b:typeof row[5]==="number"?row[5]:null});// row[5]: money at work, when not basisSteps' (12.7+)
// ---- the day-by-day table: data.json carries the newest ~400 rows
// (d.daily); older ones come from `widget_command.sh days BEFORE COUNT` and
// sit in state.older until the table changes (dailyKey).
const isDayRow=r=>Array.isArray(r)&&typeof r[0]==="string"&&typeof r[1]==="number"&&typeof r[2]==="number";// the tracker can serve older rows (12.5+ data carries dailyTotal/dailyFirst)
const canLoadOlder=d=>typeof d.dailyTotal==="number"&&typeof d.dailyFirst==="string";// every day row on hand, oldest first: loaded older rows + d.daily
const dayRowsOf=(d,state)=>{const daily=Array.isArray(d.daily)?d.daily:[];const older=state.older;if(!daily.length||!older.rows.length||older.key!==dailyKey(d))return daily;const first=daily[0][0];const before=older.rows.filter(r=>r[0]<first);return before.length?before.concat(daily):daily;};// rows older than the ones on hand exist in the full table
const olderAvailable=(d,rows)=>!!(canLoadOlder(d)&&rows.length&&rows[0][0]>d.dailyFirst);const daysBetween=(isoA,isoB)=>Math.round((new Date(isoB+"T12:00:00")-new Date(isoA+"T12:00:00"))/86400000);// rows to ask for so the table reaches back to `iso` (at most one row per
// calendar day; the tracker answers at most 5000 per call — see withDayLoaded)
const countBack=(iso,rows)=>Math.max(OLDER_CHUNK,Math.min(5000,daysBetween(iso,rows.length?rows[0][0]:iso)+7));const olderInflight={};// requests running now: tag -> callbacks waiting for that answer
let olderTimer=0;// a load queued from render (it can't dispatch while rendering)
const olderBusy=()=>Object.keys(olderInflight).length>0;// fetch `count` rows older than the oldest on hand; then(rowsNow, error) runs after
// state has them (rowsNow = everything on hand, oldest first) or on failure. The
// same request asked for again while it runs just waits for that answer.
const loadOlder=(d,rows,count,dispatch,then)=>{const key=dailyKey(d);const before=rows.length?rows[0][0]:null;if(!before)return then?then(null,"day-by-day values arrive with the next refresh"):null;const tag=key+"<"+before+"#"+count;if(olderInflight[tag])return then?olderInflight[tag].push(then):null;const waiters=olderInflight[tag]=then?[then]:[];dispatch({type:"OLDER_BUSY",key:key});const done=(all,err)=>{delete olderInflight[tag];waiters.forEach(fn=>fn(all,err));};const fail=msg=>{dispatch({type:"OLDER_RESULT",key:key,rows:[],error:msg});done(null,msg);};(0,_uebersicht.run)(helper(["days",before,String(count)])).then(out=>{const res=parseJson(out);if(!res||!Array.isArray(res.rows)||res.error)return fail(res&&typeof res.error==="string"&&res.error||"couldn't load older days");const got=res.rows.filter(r=>isDayRow(r)&&r[0]<before);// nothing older after all: stop here (a render-time retry would just loop)
if(!got.length)return fail("no older days found");got.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);dispatch({type:"OLDER_RESULT",key:key,rows:got});return done(got.concat(rows),null);}).catch(e=>fail("couldn't load older days: "+String(e).slice(0,60)));return null;};// render-time: make sure the rows reach back to time t (a custom start further
// back than the table on hand). True while more rows are on the way.
const ensureDaysBack=(d,state,rows,t,dispatch)=>{if(!rows.length||t>=rows[0][1]-1||!olderAvailable(d,rows))return false;if(state.older.msg&&state.older.key===dailyKey(d))return false;// failed: don't retry until the table changes
if(state.older.busy||olderBusy()||olderTimer)return true;const target=isoOf(t);olderTimer=setTimeout(()=>{olderTimer=0;loadOlder(d,rows,countBack(target,rows),dispatch);},0);return true;};// thin a long run of day rows to about `max` points, keeping the first and
// last row and both ends of every ≈ (rebuilt) stretch
const thinRows=(rows,max)=>{if(rows.length<=max)return rows;const out=[];let lastBucket=-1;for(let i=0;i<rows.length;i++){const bucket=Math.floor(i*max/rows.length);const edge=i===rows.length-1||i>0&&!rows[i][3]!==!rows[i-1][3]||i+1<rows.length&&!rows[i][3]!==!rows[i+1][3];if(bucket!==lastBucket||edge)out.push(rows[i]);lastBucket=bucket;}return out;};// "2026-03-14" or "03-14" -> that day's row (or the last day before it).
// rows = the day rows on hand (default d.daily). A day older than those but
// inside the full table returns {need: date}: load older rows, then retry.
const resolveDay=(text,d,rowsIn)=>{const daily=rowsIn||d.daily||[];let q=text.trim();const last=daily.length?daily[daily.length-1][0]:null;if(/^\d{1,2}-\d{1,2}$/.test(q)&&last){// month-day: the most recent one
const parts=q.split("-").map(n=>n.length<2?"0"+n:n);q=last.slice(0,4)+"-"+parts[0]+"-"+parts[1];if(q>last)q=Number(last.slice(0,4))-1+q.slice(4);}if(!/^\d{4}-\d{2}-\d{2}$/.test(q))return null;// still typing
if(isNaN(new Date(q+"T12:00:00").getTime()))return{msg:"that isn't a date"};if(!daily.length)return{msg:"day-by-day values arrive with the next refresh"};if(q>last)return{msg:"that day hasn't happened yet"};if(q<daily[0][0]){if(olderAvailable(d,daily)&&q>=d.dailyFirst)return{need:q};const first=canLoadOlder(d)&&d.dailyFirst<daily[0][0]?d.dailyFirst:daily[0][0];const sim=q<first?simDay(q,d):null;// before the first purchase: the backtest
if(sim)return sim;const simFirst=q<first?simStart(d):null;// older than every backtest tab
if(simFirst)return{msg:"simulated values start "+fmtIsoLong(simFirst)+" (you bought "+fmtIsoLong(first)+")"};return{msg:"day-by-day values start "+fmtIsoLong(first)+(d.historyPending>0?" — older prices are still downloading":"")};}let row=daily[0];for(let i=0;i<daily.length&&daily[i][0]<=q;i++)row=daily[i];return{mark:dayMark(row,row[0]!==q?q:null),range:pickRange(row[1],d)};};// the date box: load older rows until `text` resolves (a few calls at most
// for a very old date), then done(result) with the resolved day or a message
const withDayLoaded=(text,d,rows,dispatch,done,depth)=>{btModeNow=btModeFor(dispatch);// this window's simulated mode
const r=resolveDay(text,d,rows);if(!r||!r.need||(depth||0)>=6)return done(r&&r.need?{msg:"couldn't load that day"}:r);dispatch({type:"DAY_MSG",msg:"loading older days…"});return loadOlder(d,rows,countBack(r.need,rows),dispatch,(all,err)=>all&&text===dayTextBy[dispatch.w||""]?withDayLoaded(text,d,all,dispatch,done,(depth||0)+1):done({msg:all?null:err}));// (text changed: its answer is dropped)
};// the date box's latest text per window (an older-rows answer for older text is dropped)
const dayTextBy={};const onDayInput=(value,d,state,dispatch)=>{dayTextBy[dispatch.w||""]=value;dispatch({type:"SET_DAY_INPUT",value:value});if(!value.trim()){if(state.mark&&state.mark.d)return dispatch({type:"SET_MARK",mark:null});return dispatch({type:"DAY_MSG",msg:null});}withDayLoaded(value,d,dayRowsOf(d,state),dispatch,r=>{if(dayTextBy[dispatch.w||""]!==value)return;if(r&&r.mark)dispatch({type:"PICK_DAY",mark:r.mark,range:r.range,fromInput:true});else if(r&&r.msg)dispatch({type:"DAY_MSG",msg:r.msg});else dispatch({type:"DAY_MSG",msg:null});// still typing: no message for older text
});};// key tests that also accept the legacy key codes (some WebKit builds and
// automation tools send key events without the `key` name)
const isEnter=ev=>ev.key==="Enter"||ev.keyCode===13||ev.which===13||ev.charCode===13;const isEscape=ev=>ev.key==="Escape"||ev.keyCode===27||ev.which===27;// Enter in the date box: start the graph on that day
const onDayKey=(ev,d,state,dispatch)=>{if(!isEnter(ev))return;const text=ev.target.value;// the box itself: state can lag a keystroke
dayTextBy[dispatch.w||""]=text;// (a day older than the rows on hand loads them first)
withDayLoaded(text,d,dayRowsOf(d,state),dispatch,r=>{if(dayTextBy[dispatch.w||""]!==text)return;// typed on meanwhile
if(r&&r.mark)dispatch({type:"SET_FROM",from:r.mark});else if(r&&r.msg)dispatch({type:"DAY_MSG",msg:r.msg});else if(text.trim())dispatch({type:"DAY_MSG",msg:"type a full date, like 2026-03-14 or 03-14"});else if(state.mark)dispatch({type:"SET_FROM",from:state.mark});// empty box: the pinned point
});};const TICKER_RE=/^\^?[A-Z0-9][A-Z0-9.\-=&]{0,19}$/;const MONEY_SIGN=/[$€£¥₹]/;const escRe=s=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");// the display currency's own marks ("kr", "CHF", "zł", "SEK"…): letters or
// signs that say "this is money", besides the common signs above
const curMarks=()=>[curSymbol(),CUR].filter(m=>m&&/[^\d.,\s]/.test(m));const isMoneyText=text=>{const s=String(text||"");if(MONEY_SIGN.test(s))return true;const low=s.toLowerCase();return curMarks().some(m=>low.indexOf(m.toLowerCase())>=0);};// A share count: digits with an optional decimal point or comma. Rejects
// "Infinity", "1e999", "5abc" and friends that parseFloat would accept.
const parseAmount=text=>{const s=String(text||"").trim();if(!/^\d+([.,]\d+)?$/.test(s))return null;const v=Number(s.replace(",","."));return isFinite(v)&&v>0?v:null;};// A money amount ("$1000", "1,000$", "€1.000,50"), in the display currency.
const parseMoney=text=>{let s=String(text||"");curMarks().forEach(m=>{s=s.replace(new RegExp(escRe(m),"gi"),"");});s=s.replace(/[$€£¥₹\s]/g,"");if(/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s))s=s.replace(/,/g,"");else if(/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s))s=s.replace(/\./g,"").replace(",",".");else if(/^\d+([.,]\d+)?$/.test(s))s=s.replace(",",".");else return null;const v=Number(s);return isFinite(v)&&v>0?v:null;};const fmtShares=v=>String(Math.round(v*10000)/10000);const localToday=()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");};const say=(dispatch,msg,extra)=>dispatch({type:"ADD_MSG",msg:msg,tip:extra&&extra.tip,tone:extra&&extra.tone});const parseJson=out=>{try{return JSON.parse(out);}catch(e){return null;}};// ---- search as you type (debounced; one Yahoo lookup per pause)
let searchTimer=null;const runSearch=(q,dispatch)=>{dispatch({type:"SEARCH_BUSY",query:q});(0,_uebersicht.run)(helper(["search",q])).then(out=>{const res=parseJson(out)||{error:"search failed"};dispatch({type:"SEARCH_RESULTS",query:q,results:res.results||[],error:res.error||null});}).catch(()=>dispatch({type:"SEARCH_RESULTS",query:q,results:[],error:"search failed"}));};const onTickerInput=(value,dispatch)=>{dispatch({type:"SET_ADD_FIELD",field:"ticker",value:value});clearTimeout(searchTimer);const q=value.trim();if(q.length<2)return dispatch({type:"SEARCH_RESULTS",query:q,results:[]});searchTimer=setTimeout(()=>runSearch(q,dispatch),450);};const onTickerKey=(ev,state,dispatch)=>{if(isEnter(ev)){clearTimeout(searchTimer);const q=(state.addForm.ticker||"").trim();if(state.search.results.length)dispatch({type:"PICK",item:state.search.results[0]});else if(q)runSearch(q,dispatch);}else if(isEscape(ev)){dispatch({type:"SEARCH_RESULTS",query:(state.addForm.ticker||"").trim(),results:[]});}};// a purchase date typed any common way -> "YYYY-MM-DD", or null (13.5; the rule of
// import_positions.clean_date): 2024-03-01 is ISO; 01.03.2024, 01/03/2024 and
// 01-03-2024 are day first, and month first only when day first is not a real date
const parseDateLoose=text=>{const s=String(text||"").trim();let tries=[];let m=/^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);if(m)tries=[[+m[1],+m[2],+m[3]]];else{m=/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);if(!m)return null;tries=[[+m[3],+m[2],+m[1]],[+m[3],+m[1],+m[2]]];// day first, else month first
}for(let i=0;i<tries.length;i++){const y=tries[i][0],mo=tries[i][1],d=tries[i][2];if(y<1900||mo<1||mo>12||d<1)continue;const t=new Date(Date.UTC(y,mo-1,d));if(t.getUTCFullYear()!==y||t.getUTCMonth()!==mo-1||t.getUTCDate()!==d)continue;return y+"-"+String(mo).padStart(2,"0")+"-"+String(d).padStart(2,"0");}return null;};// ---- buy: look the stock up first, so the confirm line shows its real
// name and price and a typo never lands in positions.json
const submitAdd=(state,dispatch)=>{const form=state.addForm;const tk=(form.ticker||"").toUpperCase().trim();if(!TICKER_RE.test(tk))return say(dispatch,"type a ticker or a company name, then pick a match");const amt=(form.shares||"").trim();const cash=isMoneyText(amt)?parseMoney(amt):null;const sh=cash===null?parseAmount(amt):null;if(amt.toLowerCase()==="all")return say(dispatch,"'all' is for selling — press sell");if(cash===null&&sh===null)return say(dispatch,"how much? shares (10, 2.5) or money ("+money(1000)+")");let cost=null;if((form.cost||"").trim()){cost=parseAmount(form.cost);if(cost===null)return say(dispatch,"price: a positive number, like 182.40");}const date=(form.date||"").trim()?parseDateLoose(form.date):"";if(date===null)return say(dispatch,"date: 2024-03-01, 01.03.2024 or 01/03/2024 (day first)");if(date&&date>localToday())return say(dispatch,"date: that's in the future");say(dispatch,"checking "+tk+"…");(0,_uebersicht.run)(helper(["quote",tk])).then(out=>{const q=parseJson(out)||{error:"couldn't check "+tk};if(q.error)return say(dispatch,q.error);const isToday=!date||date===localToday();const paid=cost||(isToday?q.price:null);// today, no price → current price
let shares=sh;if(cash!==null){if(!q.displayRate)return say(dispatch,"no exchange rate for "+q.currency+" — enter shares instead");shares=Math.round(cash/((paid||q.price)*q.displayRate)*1e6)/1e6;if(!(shares>0))return say(dispatch,"that amount is too small");}const args=["buy",tk,String(shares)];if(paid)args.push("--cost",String(paid));if(date)args.push("--date",date);if(q.displayRate)args.push("--rate",String(q.displayRate));// for _invested
const worth=q.displayRate?shares*(paid||q.price)*q.displayRate:null;dispatch({type:"SET_PENDING",pending:{kind:"buy",ticker:tk,shares:shares,cmd:helper(args),reset:true,label:"buy "+fmtShares(shares)+" × "+tk+(q.name?" ("+q.name+")":"")+(paid?" @ "+num(paid,2)+" "+q.currency:" at that day's close")+(worth&&paid?" ≈ "+money(worth):"")+(date?" on "+date:"")+"?"}});}).catch(e=>say(dispatch,"couldn't check "+tk+": "+String(e).slice(0,60)));};const submitSell=(state,positions,dispatch)=>{const form=state.addForm;const tk=(form.ticker||"").toUpperCase().trim();const pos=positions.find(p=>p.ticker===tk);if(!pos)return say(dispatch,TICKER_RE.test(tk)?"you don't hold "+tk:"which stock? type its ticker");const amt=(form.shares||"").trim().toLowerCase();let price=null;if((form.cost||"").trim()){price=parseAmount(form.cost);if(price===null)return say(dispatch,"price: a positive number");}let args,what,sold;if(amt==="all"){sold="all";args=["sell",tk,"--all"];what="ALL "+fmtShares(pos.shares)+" × "+tk;}else{let sh=parseAmount(amt);if(isMoneyText(amt)){const cash=parseMoney(amt);const perShare=(price||pos.price)*(pos.fxRate||1);sh=cash&&perShare?Math.round(cash/perShare*1e6)/1e6:null;}if(!sh)return say(dispatch,"how much? shares, money ("+money(500)+"), or 'all'");if(sh>pos.shares+1e-9)return say(dispatch,"you hold "+fmtShares(pos.shares)+" "+tk);args=["sell",tk,String(sh)];sold=sh;what=fmtShares(sh)+" × "+tk;}if(price)args.push("--price",String(price));dispatch({type:"SET_PENDING",pending:{kind:"sell",ticker:tk,shares:sold,cmd:helper(args),reset:true,label:"sell "+what+(price?" @ "+num(price,2)+" "+pos.currency:" at the last price")+"?"}});};// Open the detail view for any ticker; the full chart data arrives from
// "look" a second later (kept per ticker while the detail stays open).
const openStock=(ticker,dispatch,state)=>{dispatch({type:"SET_STOCK",ticker:ticker});const nw=state?newsOf(state,ticker):null;if(ticker&&state&&newsOn(state)&&(enabled(state._win||null,"detail.news")||enabled(state._win||null,"panel.news"))&&!(state.focusTicker===ticker&&nw&&(nw.busy||(nw.items||[]).length))){loadNews(ticker,dispatch);}if(!ticker||state&&state.lookTicker===ticker&&lookOf(state,ticker).data)return;dispatch({type:"LOOK_BUSY",ticker:ticker});(0,_uebersicht.run)(helper(["look",ticker])).then(out=>{const r=parseJson(out)||{error:"lookup failed"};dispatch({type:"LOOK_RESULT",ticker:ticker,data:r.error?null:r,error:r.error||null});}).catch(e=>dispatch({type:"LOOK_RESULT",ticker:ticker,data:null,error:"lookup failed: "+String(e).slice(0,60)}));};const watchToggle=(ticker,on,dispatch,msgType)=>{const type=msgType||"DETAIL_MSG";dispatch({type:type,msg:"working…"});(0,_uebersicht.run)(helper([on?"watch":"unwatch",ticker])).then(out=>dispatch({type:type,msg:String(out).trim().slice(0,100)||"done"})).catch(e=>dispatch({type:type,msg:"error: "+String(e).slice(0,80)}));};// headlines for the open stock (only ever called with headlines on)
const loadNews=(ticker,dispatch)=>{dispatch({type:"NEWS_BUSY",ticker:ticker});(0,_uebersicht.run)(helper(["news",ticker])).then(out=>{const r=parseJson(out)||{error:"headlines unavailable"};dispatch({type:"NEWS_RESULT",ticker:ticker,items:r.on===false?[]:r.items,error:r.on===false?"headlines are off":r.error||null});}).catch(()=>dispatch({type:"NEWS_RESULT",ticker:ticker,items:[],error:"headlines unavailable"}));};// ---- price alerts (alerts.py via widget_command.sh alert …, 12.9)
// "-20%" = % from your average cost (holdings only); a plain price = above or
// below, whichever side of today's price it is on
const PCT_ALERT=/^[-+]?\d+([.,]\d+)?\s*%$/;const PRICE_ALERT=/^\+?\d+([.,]\d+)?$/;const alertFromText=(text,p,held)=>{const t=String(text||"").trim();if(!t)return{error:"type a price (400) or a % from your cost (-20%)"};if(PCT_ALERT.test(t)){if(!held)return{error:"% from cost needs a holding"};if(p.costUnknown===true)return{error:"% from cost needs its purchase price or date"};return{kind:"pctFromCost",value:t.replace(/\s*%$/,"").replace(",",".")};}if(!PRICE_ALERT.test(t))return{error:"type a price (400) or a % from your cost (-20%)"};const v=parseFloat(t.replace(",","."));if(!(v>0))return{error:"the price must be above 0"};if(!isFin(p.price))return{error:"no price yet — try again after the next refresh"};if(v===p.price)return{error:"that's the price now"};return{kind:v>p.price?"above":"below",value:String(v)};};const alertCall=(args,dispatch,clear)=>{dispatch({type:"ALERT_BUSY"});(0,_uebersicht.run)(helper(["alert"].concat(args))).then(out=>{const r=parseJson(out)||{error:String(out||"").trim().slice(0,100)||"could not save the alert"};dispatch({type:"ALERT_RESULT",ok:!r.error,clear:clear,msg:String(r.error?"error: "+r.error:r.message||"done").slice(0,140)});}).catch(e=>dispatch({type:"ALERT_RESULT",ok:false,msg:"error: "+String(e).slice(0,80)}));};const submitAlert=(state,p,held,dispatch)=>{if(state.alertBusy)return;const a=alertFromText(state.alertInput,p,held);if(a.error){dispatch({type:"ALERT_RESULT",ok:false,msg:a.error});return;}alertCall(["add",p.ticker,a.kind,a.value],dispatch,true);};const removeAlert=(id,dispatch)=>alertCall(["remove",id],dispatch,false);// 13.6: a note and a price target per stock (holding_meta.py; data.json "notes"
// = {TICKER: {note, target, side, at}}, absent before 13.6 — nothing then shows).
// A save's reply is held in notesLocal for NOTES_HOLD_TICKS ticks, so a fetch
// already under way cannot flash the old note back.
const NOTES_HOLD_TICKS=3;const notesOn=d=>!!(d&&d.notes&&typeof d.notes==="object");const notesFresh=(nl,tick)=>!!(nl&&nl.map&&typeof nl.map==="object"&&(tick||0)-(nl.tick||0)<NOTES_HOLD_TICKS);const noteOf=(state,d,tk)=>{if(!tk||!notesOn(d))return null;const nl=state&&state.notesLocal;const local=notesFresh(nl,state&&state.tick)&&Object.prototype.hasOwnProperty.call(nl.map,tk);const e=(local?nl.map[tk]:d.notes[tk])||null;if(!e||typeof e!=="object")return null;const note=typeof e.note==="string"&&e.note.trim()?e.note:null;const target=isFin(e.target)&&e.target>0?e.target:null;if(note===null&&target===null)return null;return{note:note,target:target,side:e.side==="above"||e.side==="below"?e.side:null,at:typeof e.at==="string"?e.at:null};};const targetGap=(e,p)=>{if(!e||e.target===null||e.target===undefined||!p||!isFin(p.price)||!(p.price>0))return null;const pct=(e.target/p.price-1)*100;return{pct:pct,reached:e.side==="above"?p.price>=e.target:e.side==="below"?p.price<=e.target:Math.abs(pct)<0.05};};const gapText=g=>g?g.reached?"reached":num(Math.abs(g.pct),1)+"% away":"";const noteTip=(e,p)=>{if(!e)return"";const lines=[];if(e.note)lines.push("note: "+e.note);if(e.target!==null){const g=targetGap(e,p);lines.push("price target "+num(e.target,2)+" "+(p&&p.currency||"")+(g?" · "+gapText(g):""));}return lines.join("\n");};const metaCall=(args,ticker,dispatch)=>{dispatch({type:"NOTE_BUSY"});(0,_uebersicht.run)(helper(["meta"].concat(args))).then(out=>{const r=parseJson(out)||{error:String(out||"").trim().slice(0,100)||"could not save the note"};dispatch({type:"NOTE_RESULT",ok:!r.error,ticker:ticker,entry:r.entry||null,msg:String(r.error?"error: "+r.error:r.message||"saved").slice(0,140)});}).catch(e=>dispatch({type:"NOTE_RESULT",ok:false,msg:"error: "+String(e).slice(0,80)}));};const submitNote=(state,p,dispatch)=>{if(state.noteBusy||!p||!p.ticker)return;const field=state.noteEdit,tk=p.ticker,t=String(state.noteInput||"").trim();if(field==="note"){metaCall(["note",tk,t],tk,dispatch);return;}if(field!=="target")return;if(!t){metaCall(["target",tk,"clear"],tk,dispatch);return;}// (1,000 is refused like holding_meta.py does: a thousands separator, not a decimal comma)
const v=/^\d+([.,]\d+)?$/.test(t)&&!/^[1-9]\d{0,2}(,\d{3})+$/.test(t)?parseFloat(t.replace(",",".")):NaN;if(!(v>0)){dispatch({type:"NOTE_RESULT",ok:false,msg:"error: type a price like 72 or 72.50"});return;}const side=isFin(p.price)?v>p.price?"above":v<p.price?"below":null:null;metaCall(["target",tk,String(v)].concat(side?[side]:[]),tk,dispatch);};// a display choice: the screen follows at once (state), then it is saved in
// _settings; a failed save only means it isn't remembered after a restart
const savePref=(key,on,dispatch)=>{dispatch(key==="graphBig"?{type:"TOGGLE_GRAPH_BIG",on:on}:key==="news"?{type:"SET_NEWS_PREF",on:on}:{type:"SET_SHOW_BENCH",on:on});return runQueued(["setting",key,on?"true":"false"]).then(out=>offerUndo(out,dispatch)).catch(()=>{});};// one line or everything (a title click, 12.11), saved the same way
const toggleCompact=(on,dispatch)=>{dispatch({type:"SET_COMPACT",on:on});return runQueued(["setting","compact",on?"true":"false"]).then(out=>offerUndo(out,dispatch)).catch(()=>{});};// a title click; the second click of a double-click doesn't toggle back, and
// the click that ends a drag of the title row never gets here (swallowClick)
// (a window of _settings.display keeps its own one-line choice)
const titleClick=(state,dispatch)=>ev=>{if(ev&&ev.detail>1)return;if(state._disp&&state._win){dispatch({type:"HOVER_PT",t:null});return changeWin(state,state._win.id,{compact:compactOf(state)?undefined:true},dispatch);}toggleCompact(!compactOf(state),dispatch);};// ---- CSV export (12.11): export.py writes the files, Finder shows them.
// Only an absolute path without line breaks / NUL reaches `open -R`, quoted.
const EXPORT_TICKS=6;// the message stays this many data ticks
const revealable=p=>typeof p==="string"&&p.charAt(0)==="/"&&p.length<4096&&!/[\n\r\0]/.test(p);const exportCsv=(state,dispatch)=>{const m=state.exportMsg;if(m&&m.text==="exporting…"&&state.tick-m.tick<=EXPORT_TICKS)return;// one at a time
dispatch({type:"EXPORT_MSG",text:"exporting…"});const fail=why=>dispatch({type:"EXPORT_MSG",text:"export failed",err:true,tip:String(why||"the export helper gave no answer").slice(0,300)});return(0,_uebersicht.run)(helper(["export"])).then(out=>{let r=null;try{r=JSON.parse(String(out||"").trim());}catch(e){r=null;}if(!r||typeof r!=="object")return fail(String(out||"").trim());if(r.ok!==true)return fail(typeof r.error==="string"?r.error:"");const shown=typeof r.dirShown==="string"&&r.dirShown?r.dirShown:"~/Documents/Portfolio";const rows=r.rows&&typeof r.rows==="object"?r.rows:{};const tip=(Array.isArray(r.files)?r.files.filter(f=>typeof f==="string").join(", "):"")+["holdings","daily","sales","dividends"].filter(k=>isFin(rows[k])).map((k,i)=>(i?" · ":"\n")+k+" "+rows[k]+" rows").join("");dispatch({type:"EXPORT_MSG",text:"exported to "+shown,tip:tip});if(revealable(r.path))(0,_uebersicht.run)("open -R "+shq(r.path)).catch(()=>{});}).catch(e=>fail(e&&e.message?e.message:e));};// ---- the index to compare with (_settings.benchmark, 12.10): "index: SPY ▾"
// under the value graph opens this list. Picking saves the choice
// (set_setting.py, which also asks for a refresh: the new index needs its
// prices); the caption says "loading SPY…" until data with it arrives.
// Every symbol here was checked on Yahoo for long daily history (2026-09-23).
const BENCH_DEFAULTS={USD:"SPY",CAD:"XIU.TO",EUR:"EXW1.DE",GBP:"ISF.L",AUD:"STW.AX",JPY:"1306.T",CHF:"CSSMI.SW",HKD:"2800.HK"};// the tracker's DEFAULT_BENCHMARKS
const benchDefault=cur=>BENCH_DEFAULTS[cur]||"ACWI";const BENCH_GROUPS=[{name:"US",cur:["USD"],items:[["SPY","S&P 500"],["QQQ","Nasdaq-100"],["VTI","Total US market"],["DIA","Dow Jones 30"],["IWM","Russell 2000 small caps"]]},{name:"World",cur:[],items:[["VT","Total world"],["ACWI","MSCI All Country World"],["EFA","Developed ex-US"],["EEM","Emerging markets"]]},{name:"Canada",cur:["CAD"],items:[["XIU.TO","S&P/TSX 60"],["XIC.TO","S&P/TSX Composite"],["VFV.TO","S&P 500 in CAD"],["XEQT.TO","All-equity world, CAD"]]},{name:"Europe",cur:["EUR","GBP","CHF"],items:[["EXW1.DE","EURO STOXX 50"],["IWDA.AS","MSCI World, EUR"],["ISF.L","FTSE 100"]]}];// the home currency's group first, the rest in their usual order
const benchGroupsFor=cur=>{let home=BENCH_GROUPS.filter(g=>g.cur.indexOf(cur)>=0);if(!home.length)home=BENCH_GROUPS.filter(g=>g.name==="World");// the default there is ACWI
return home.concat(BENCH_GROUPS.filter(g=>home.indexOf(g)<0));};// "auto" | "none" | SYMBOL, or null (not a choice: older data has no ui.benchmark)
const normBench=v=>{if(typeof v!=="string")return null;const s=v.trim().toUpperCase();if(s==="AUTO")return"auto";if(s==="NONE"||s==="OFF")return"none";return TICKER_RE.test(s)?s:null;};// this session's pick, else the saved one (null with older data: no picker link)
const benchWantOf=(st,d)=>typeof st.benchWant==="string"?st.benchWant:normBench(d&&d.ui&&typeof d.ui==="object"?d.ui.benchmark:null);// the pick only bridges the wait for data: it goes (back to data.json's
// choice) once new data carries it AND its index, or once — after the save
// — data.json says something else (changed by hand or in another session)
const benchWantAfter=(st,d)=>{const want=st.benchWant;if(typeof want!=="string"||!d||typeof d!=="object")return want;const ui=normBench(d.ui&&typeof d.ui==="object"?d.ui.benchmark:null);if(ui===null)return want;// older data: no choice in it
if(ui!==want)return st.benchSaved===true?null:want;if(want==="none")return null;const b=d.benchmark&&typeof d.benchmark==="object"?d.benchmark:null;const sym=want==="auto"?benchDefault(d.currency):want;return b&&b.symbol===sym&&(want!=="auto"||b.source==="default")?null:want;};// a click anywhere but the picker (or its own link) closes it, as does Esc;
// the window listeners live exactly as long as the picker is on screen
// (one set per window, 12.12: dispatch.w; a click in another window's picker closes this one)
const benchAway={};const benchKey=dispatch=>dispatch&&typeof dispatch.w==="string"?dispatch.w:"";const benchDisarm=dispatch=>{const k=benchKey(dispatch),a=benchAway[k];if(!a||typeof window==="undefined")return;window.removeEventListener("mousedown",a.down,true);window.removeEventListener("keydown",a.key,true);delete benchAway[k];};const benchArm=(el,dispatch)=>{benchDisarm(dispatch);if(!el||typeof window==="undefined")return;const k=benchKey(dispatch);const close=()=>{benchDisarm(dispatch);dispatch({type:"BENCH_PICK",open:false});};benchAway[k]={down:ev=>{const t=ev.target;const pk=t&&t.closest?t.closest("[data-pw-benchpick]"):null;const wr=pk&&pk.closest?pk.closest("[data-pw-win]"):null;if(pk&&(!k||!wr||wr.getAttribute("data-pw-win")===k))return;close();},key:ev=>{if(isEscape(ev))close();}};window.addEventListener("mousedown",benchAway[k].down,true);window.addEventListener("keydown",benchAway[k].key,true);};// the picker went off screen without a click (other view, new data): closed,
// so it doesn't come back by itself; after this render, once
const benchCloseTimer={};// per window (dispatch.w)
const benchCloseLater=dispatch=>{const k=benchKey(dispatch);if(benchCloseTimer[k]||typeof setTimeout==="undefined")return;benchCloseTimer[k]=setTimeout(()=>{delete benchCloseTimer[k];dispatch({type:"BENCH_PICK",open:false});},0);};const pickBench=(value,hidden,dispatch)=>{const v=normBench(value);if(!v)return dispatch({type:"BENCH_MSG",msg:"not a Yahoo symbol — like VOO, XEQT.TO or ^GSPC"});benchDisarm(dispatch);dispatch({type:"SET_BENCH",value:v});// picking one shows it: on screen at once, but saved only AFTER the index
// is — two set_setting.py runs at the same moment each load and rewrite
// positions.json / data.json, and one would undo the other's change
const show=hidden&&v!=="none";if(show)dispatch({type:"SET_SHOW_BENCH",on:true});// (each run offers its undo; showBenchmark's is the newest record, so it comes last)
const saveShow=()=>show?runQueued(["setting","showBenchmark","true"]).then(out=>offerUndo(out,dispatch)).catch(()=>{}):null;return runQueued(["setting","benchmark",v]).then(out=>{const r=parseJson(String(out).trim());if(!r||r.error)dispatch({type:"BENCH_FAIL",msg:r&&r.error||"could not save the index"});else{dispatch({type:"BENCH_SAVED",value:v});offerUndo(out,dispatch);}},()=>dispatch({type:"BENCH_FAIL",msg:"could not save the index"})).then(saveShow);};const submitBenchInput=(text,hidden,dispatch)=>{const s=String(text||"").trim().toUpperCase();if(!s)return dispatch({type:"BENCH_MSG",msg:"type a Yahoo symbol, like VOO or XEQT.TO"});if(s==="AUTO"||s==="NONE"||s==="OFF"||!TICKER_RE.test(s)){return dispatch({type:"BENCH_MSG",msg:"not a Yahoo symbol — like VOO, XEQT.TO or ^GSPC"});}return pickBench(s,hidden,dispatch);};const benchPickCss=(0,_uebersicht.css)(_templateObject35());const benchRowCss=(0,_uebersicht.css)(_templateObject36());const BenchRow=({sym,label,on,onPick})=>html("div",{className:(0,_uebersicht.css)(_templateObject37(),mono,benchRowCss),onClick:onPick,title:on?"the index you compare with now":"compare with "+sym},html("span",{style:{width:8,flex:"none",color:C.ink}},on?"✓":""),html("span",{style:{minWidth:50,flex:"none",color:on?C.ink:C.line}},sym),html("span",{style:{color:C.dim,overflow:"hidden",textOverflow:"ellipsis"}},label));// want: the current choice ("auto" | "none" | SYMBOL); cur: the home currency
const BenchPicker=({want,cur,hidden,state,dispatch})=>{const pick=v=>()=>pickBench(v,hidden,dispatch);const def=benchDefault(cur);const listed={};BENCH_GROUPS.forEach(g=>g.items.forEach(it=>{listed[it[0]]=true;}));const other=want&&want!=="auto"&&want!=="none"&&!listed[want]?want:null;return html("div",{className:benchPickCss,"data-pw-benchpick":"1",ref:el=>benchArm(el,dispatch)},html("div",{className:(0,_uebersicht.css)(_templateObject38(),mono,C.dim)},html("span",null,"compare your line with"),html("span",{className:linkBtn,style:{fontSize:8.5},title:"close (Esc)",onClick:()=>{benchDisarm(dispatch);dispatch({type:"BENCH_PICK",open:false});}},"close")),html("div",{className:(0,_uebersicht.css)(_templateObject39())},html(BenchRow,{sym:"auto",label:"the default for "+cur+": "+def,on:want==="auto",onPick:pick("auto")}),html(BenchRow,{sym:"none",label:"no comparison (no index requests)",on:want==="none",onPick:pick("none")})),html("div",{className:(0,_uebersicht.css)(_templateObject40())},benchGroupsFor(cur).map(g=>html("div",{key:g.name},html("div",{className:eyebrow,style:{fontSize:7.5,padding:"1px 4px"}},g.name),g.items.map(it=>html(BenchRow,{key:it[0],sym:it[0],label:it[1],on:want===it[0],onPick:pick(it[0])}))))),other?html("div",{className:(0,_uebersicht.css)(_templateObject41())},html(BenchRow,{sym:other,label:"your own symbol",on:true,onPick:pick(other)})):null,html("div",{className:(0,_uebersicht.css)(_templateObject42())},html("input",{className:inputCss,style:{fontSize:8.5,padding:"2px 5px",flex:"1 1 auto",minWidth:0},placeholder:"other Yahoo symbol (VOO, XEQT.TO, ^GSPC) + Enter",value:state.benchInput||"",title:"any symbol Yahoo Finance knows: an ETF, an index (^GSPC) or a stock",onChange:ev=>dispatch({type:"BENCH_INPUT",value:ev.target.value}),onKeyDown:ev=>{if(isEnter(ev))submitBenchInput(ev.target.value,hidden,dispatch);else if(isEscape(ev)){benchDisarm(dispatch);dispatch({type:"BENCH_PICK",open:false});}}}),html("span",{className:linkBtn,style:{fontSize:8.5,flex:"none"},onClick:()=>submitBenchInput(state.benchInput,hidden,dispatch)},"use")),state.benchMsg?html("div",{className:(0,_uebersicht.css)(_templateObject43(),mono,C.down)},state.benchMsg):null);};// 13.5: the first buy over the demo portfolio offers to replace the demo
// holdings first (sell --reset-all prints plain text, so it is its own run)
const demoOffered=(pending,demoKind)=>demoKind==="example"&&!!pending&&pending.kind==="buy";// data.json's demoKind, except "example" stops counting once a buy or import over
// the demo went through (data.json catches up a minute later): a second buy in that
// minute must not offer to clear the list again (DEMO_SETTLED)
const demoKindOf=(state,d)=>d.demoKind==="example"&&state.demoSettled?null:d.demoKind||null;// --if-demo: the helper re-checks positions.json and removes nothing once the
// owner's own holdings are in it (13.5; not for the explicit "start fresh")
const DEMO_RESET=helper(["sell","--reset-all","--if-demo"]);// 13.6: how many demo holdings there are (data.json, while demoKind is "example"; 0 = unknown)
const demoNOf=d=>d&&d.demoKind==="example"&&Array.isArray(d.positions)?d.positions.length:0;const demoWord=n=>n?"the "+n+" demo holdings":"the demo holdings";const demoNow=state=>demoNOf(state&&state.raw&&state.raw.data);const confirmPending=(pending,dispatch,demoKind,demoN)=>executePending(pending,dispatch,demoOffered(pending,demoKind)&&pending.demoReplace!==false?DEMO_RESET:null,demoOffered(pending,demoKind),demoN);const demoKept=n=>"; "+demoWord(n)+" stay (sell removes them)";const DEMO_GONE=" — the demo holdings were already removed (a backup of the file is kept)";const errText=e=>String(e&&e.message||e);// pre (clearing the demo holdings) first, then cmd; a failed cmd after it carries afterPre
const runAfter=(pre,cmd)=>!pre?(0,_uebersicht.run)(cmd):(0,_uebersicht.run)(pre).then(o=>{const t=String(o).trim();if(/^error/i.test(t))throw new Error(t.replace(/^error:\s*/i,""));return(0,_uebersicht.run)(cmd).catch(e=>{const err=new Error(errText(e));err.afterPre=true;throw err;});});const executePending=(pending,dispatch,pre,offered,demoN)=>{dispatch({type:"CLEAR_PENDING"});say(dispatch,"working…");runAfter(pre,pending.cmd).then(out=>{const msg=String(out).trim();const ok=!/^error/i.test(msg);if(ok&&offered)dispatch({type:"DEMO_SETTLED"});// 13.5: a buy or sale says in plain words when the list catches up; the
// helper's own line stays on hover
if(ok&&pending.kind==="buy"){say(dispatch,"added "+fmtShares(pending.shares)+" × "+pending.ticker+" — in the list within a minute"+(pre?" (demo holdings replaced, backup kept)":offered?demoKept(demoN):""),{tip:msg,tone:"amber"});dispatch({type:"JUST_ADDED",ticker:pending.ticker});}else if(ok&&pending.kind==="sell"){say(dispatch,"sold "+(pending.shares==="all"?"all of ":fmtShares(pending.shares)+" × ")+pending.ticker+" — the list catches up within a minute",{tip:msg,tone:"amber"});}else say(dispatch,(msg.slice(0,140)||"done")+(!ok&&pre?DEMO_GONE:""));if(pending.reset&&ok)dispatch({type:"FORM_RESET"});}).catch(e=>{// "your own holdings are in the list now": the next try goes straight to the buy
if(pre&&/nothing removed/.test(errText(e)))dispatch({type:"DEMO_SETTLED"});say(dispatch,"error: "+errText(e).slice(0,90)+(e&&e.afterPre?DEMO_GONE:""));});};const suggestRow=(0,_uebersicht.css)(_templateObject44());const Suggestions=({state,dispatch})=>{const s=state.search;if(s.results.length){return html("div",{className:(0,_uebersicht.css)(_templateObject45(),C.faint)},s.results.map(r=>html("div",{key:r.symbol,className:suggestRow,title:"use "+r.symbol,onClick:()=>dispatch({type:"PICK",item:r})},html("span",{className:mono},r.symbol,r.held?html("span",{style:{color:C.amber}}," \xB7 held"):null),html("span",{style:{color:C.dim,marginLeft:8,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:200}},r.name,r.exchange?" · "+r.exchange:"",r.type&&r.type!=="Equity"?" · "+r.type:""))));}const note=s.busy?"searching…":s.error?s.error:s.query&&s.query.length>=2&&!state.picked?"no matches — try another name, or type the exact ticker":null;return note?html("div",{className:(0,_uebersicht.css)(_templateObject46(),mono,C.dim)},note):null;};// 13.5: the demo holdings on the first buy or import — replace them (the
// default; sell --reset-all keeps a backup, the settings and the cash) or keep them
const DemoReplaceChips=({replace,pick,n})=>html("div",{className:welcomeLine,style:{marginTop:4,fontSize:9},"data-pw-demo-offer":"1"},html("span",{style:edDim},demoWord(n)+":"),html("span",{className:replace?(0,_uebersicht.css)(_templateObject47(),tabBtn,tabActive):tabBtn,"data-pw-demo-replace":"replace",title:"clear the demo holdings first, then add yours (a backup of the file is kept; your settings and cash stay)",onClick:()=>pick(true)},"replace them (recommended)"),html("span",{className:!replace?(0,_uebersicht.css)(_templateObject48(),tabBtn,tabActive):tabBtn,"data-pw-demo-replace":"keep",title:"add yours next to the demo holdings (sell removes them later)",onClick:()=>pick(false)},"keep them"));// React's autoFocus only covers form fields: a div that should take the keys
// when it appears (the confirm line) is focused once, on its first mount
const focusOnce=el=>{if(el&&!el.getAttribute("data-pw-focused")&&typeof el.focus==="function"){el.setAttribute("data-pw-focused","1");try{el.focus();}catch(e){/* not focusable here */}}};// Return in the shares / price / date box = buy (13.5); a second Return while the
// stock is being checked (or a buy waits for confirm) is ignored. Esc drops a waiting buy.
const addFieldKey=(ev,state,dispatch)=>{if(ev.repeat)return;if(isEnter(ev)){if(!state.pendingAction&&!/^checking/.test(state.addMsg||""))submitAdd(state,dispatch);}else if(isEscape(ev))dispatch({type:"CLEAR_PENDING"});};const AddForm=props=>props.state.imp&&props.state.imp.open?html(ImportPanel,{state:props.state,dispatch:props.dispatch,demoKind:props.demoKind}):html(AddFormMain,props);const AddFormMain=({state,dispatch,empty,positions,demoKind})=>html("div",{className:(0,_uebersicht.css)(_templateObject49(),C.faint)},html("div",{className:(0,_uebersicht.css)(_templateObject50())},html("input",{className:inputCss,placeholder:"stock: name or ticker",value:state.addForm.ticker,"data-pw-add-ticker":"1",title:"type a company name (apple, shopify) or a ticker (MSFT, SHOP.TO, VOD.L, BTC-USD) and pick a match",onChange:ev=>onTickerInput(ev.target.value,dispatch),onKeyDown:ev=>onTickerKey(ev,state,dispatch)}),html("input",{className:inputCss,placeholder:"shares or "+curSymbol()+" amount",value:state.addForm.shares,"data-pw-add-shares":"1",title:"10 = ten shares · "+money(1000)+" = that much money's worth · 'all' = sell everything · Return = buy",onChange:ev=>dispatch({type:"SET_ADD_FIELD",field:"shares",value:ev.target.value}),onKeyDown:ev=>addFieldKey(ev,state,dispatch)})),state.picked?html("div",{className:(0,_uebersicht.css)(_templateObject51(),mono,C.dim)},state.picked.symbol," \xB7 ",state.picked.name,state.picked.exchange?" · "+state.picked.exchange:"",state.picked.held?" · you hold "+fmtShares(state.picked.held):""):null,html(Suggestions,{state:state,dispatch:dispatch}),html("div",{className:(0,_uebersicht.css)(_templateObject52())},html("input",{className:inputCss,placeholder:"price/sh (optional)",value:state.addForm.cost,"data-pw-add-cost":"1",title:"buy: what you paid per share \xB7 sell: what you got. Empty = the current price (or that day's close for a past date).",onChange:ev=>dispatch({type:"SET_ADD_FIELD",field:"cost",value:ev.target.value}),onKeyDown:ev=>addFieldKey(ev,state,dispatch)}),html("input",{className:inputCss,placeholder:"bought on (optional)",value:state.addForm.date,"data-pw-add-date":"1",title:"the day you bought \u2014 2024-03-01, 01.03.2024 or 01/03/2024 (day first); empty = today",onChange:ev=>dispatch({type:"SET_ADD_FIELD",field:"date",value:ev.target.value}),onKeyDown:ev=>addFieldKey(ev,state,dispatch)})),state.pendingAction?html("div",{key:"pending","data-pw-add-pending":"1",tabIndex:-1,autoFocus:true,style:{marginTop:6,outline:"none"},ref:focusOnce,onKeyDown:ev=>{if(ev.repeat)return;// a held Return must not confirm what it just asked
if(isEnter(ev))confirmPending(state.pendingAction,dispatch,demoKind,demoNow(state));else if(isEscape(ev))dispatch({type:"CLEAR_PENDING"});}},html("div",{className:(0,_uebersicht.css)(_templateObject53(),mono,C.amber)},state.pendingAction.label),demoOffered(state.pendingAction,demoKind)?html(DemoReplaceChips,{replace:state.pendingAction.demoReplace!==false,n:demoNow(state),pick:on=>dispatch({type:"PENDING_SET",patch:{demoReplace:on}})}):null,html("div",{style:{marginTop:4,textAlign:"right"}},html("span",{className:(0,_uebersicht.css)(_templateObject54(),tabBtn,tabActive),"data-pw-add-confirm":"1",title:"Return also confirms",onClick:()=>confirmPending(state.pendingAction,dispatch,demoKind,demoNow(state))},"confirm"),html("span",{className:tabBtn,"data-pw-add-cancel":"1",title:"Esc also cancels",onClick:()=>dispatch({type:"CLEAR_PENDING"})},"cancel"))):html("div",{key:"line",className:rowFlex,style:{marginTop:6}},html("span",{className:(0,_uebersicht.css)(_templateObject55(),mono),"data-pw-add-msg":"1",title:state.addMsgTip||undefined,style:state.addMsgTone==="amber"&&state.tick-state.addMsgTick<2?{color:C.amber,flex:"1 1 150px",maxWidth:"none"}:{color:C.dim}},state.addMsg||(empty?"add your first holding — any stock Yahoo Finance lists":"any stock, ETF or crypto on Yahoo Finance")),html("span",{style:{whiteSpace:"nowrap"}},html("span",{className:tabBtn,title:"see its chart, moves and volatility without adding it",onClick:()=>{const tk=(state.addForm.ticker||"").toUpperCase().trim();if(!TICKER_RE.test(tk))return say(dispatch,"type a ticker or a company name, then pick a match");openStock(tk,dispatch,state);}},"look"),html("span",{className:tabBtn,title:"monitor it in the watch tab (no shares)",onClick:()=>{const tk=(state.addForm.ticker||"").toUpperCase().trim();if(!TICKER_RE.test(tk))return say(dispatch,"type a ticker or a company name, then pick a match");watchToggle(tk,true,dispatch,"ADD_MSG");}},"watch"),html("span",{className:(0,_uebersicht.css)(_templateObject56(),tabBtn,tabActive),title:"record a buy",onClick:()=>submitAdd(state,dispatch)},"buy"),html("span",{className:tabBtn,title:"record a sale (oldest shares first)",onClick:()=>submitSell(state,positions,dispatch)},"sell"))),html("div",{className:rowFlex,style:{marginTop:5}},html("span",{className:linkBtn,title:"show positions.json in Finder \u2014 edit it with any text editor",onClick:()=>(0,_uebersicht.run)("open -R ".concat(shq(DIR+"/positions.json")))},"show file"),html("span",{className:linkBtn,title:"add many holdings at once: paste a list, or pick a CSV file exported from your broker","data-pw-import-open":"1",onClick:()=>openImport(state,dispatch)},"import a list\u2026"),empty?null:html("span",{className:linkBtn,title:"remove every holding (your old file is kept as a backup)",onClick:()=>dispatch({type:"SET_PENDING",pending:{kind:"reset",cmd:helper(["sell","--reset-all"]),label:"remove ALL holdings? (backup kept)"}})},"start fresh")));// ---- import (13.4): many holdings at once — a pasted list or a CSV file
// (import_positions.py: "preview" shows what would be added, "commit" adds)
const welcomeCss=(0,_uebersicht.css)(_templateObject57());// 13.5: the welcome card's steps look like buttons (a filled pill), not text
const welcomeChip=(0,_uebersicht.css)(_templateObject58(),tabBtn,C.ink);const welcomeLine=(0,_uebersicht.css)(_templateObject59());// (a row's note may wrap onto a line of its own: one more line per note)
// (13.6: plus the column header line above the rows)
// 13.6: the preview's columns (8.5 px mono): 4 columns + gaps = 240 px, so a row fits a
// 320 px window; the note sits beside the row or on a line of its own
const IMPORT_COLS={stock:56,shares:40,price:58,date:62,gap:6};const importH=st=>st.imp&&st.imp.open?LAYOUT_K.IMPORT+(st.imp.rows||[]).slice(0,12).reduce((n,r)=>n+1+(r&&r.note?1:0),(st.imp.rows||[]).length?1:0)*LAYOUT_K.ROW_LINE:0;const openImport=(state,dispatch)=>{if(!state.showAdd)dispatch({type:"TOGGLE_ADD"});dispatch({type:"IMPORT_SET",imp:{open:true,rows:null,msg:null,busy:false}});};const importArgs=imp=>imp.file?["--file",imp.file]:["--text",imp.text||""];const importPreview=(state,dispatch)=>{const imp=state.imp||IMPORT_EMPTY;if(!imp.file&&!(imp.text||"").trim())return dispatch({type:"IMPORT_SET",imp:{msg:"paste a list first, or pick a file"}});dispatch({type:"IMPORT_SET",imp:{busy:true,msg:"reading…",rows:null}});(0,_uebersicht.run)(helper(["import","preview"].concat(importArgs(imp)))).then(out=>{const r=parseJson(String(out).trim());if(!r||r.error&&!(r.rows||[]).length){return dispatch({type:"IMPORT_SET",imp:{busy:false,msg:r&&r.error||"could not read the list"}});}dispatch({type:"IMPORT_SET",imp:{busy:false,rows:r.rows||[],ok:r.ok||0,skipped:r.skipped||0,format:r.format||null,msg:r.ok?null:"no holding found — one per line: ticker and shares (KO 10)"}});},e=>dispatch({type:"IMPORT_SET",imp:{busy:false,msg:"could not read the list: "+String(e).slice(0,60)}}));};const importCommit=(state,dispatch,demoKind)=>{const imp=state.imp||IMPORT_EMPTY;// 13.5: over the demo portfolio, the demo holdings go first unless "keep them"
const offered=demoKind==="example",replace=offered&&imp.demoReplace!==false,demoN=demoNow(state);dispatch({type:"IMPORT_SET",imp:{busy:true,msg:"adding…"}});runAfter(replace?DEMO_RESET:null,helper(["import","commit"].concat(importArgs(imp)))).then(out=>{const r=parseJson(String(out).trim());if(!r||r.error)return dispatch({type:"IMPORT_SET",imp:{busy:false,msg:(r&&r.error||"could not add them")+(replace?DEMO_GONE:"")}});if(offered)dispatch({type:"DEMO_SETTLED"});dispatch({type:"IMPORT_SET",imp:null});dispatch({type:"FORM_RESET"});const n=r.added||0,k=r.skipped||0;say(dispatch,"added "+plural(n,"holding")+(k?" ("+plural(k,"line")+" skipped)":"")+" — prices come with the next refresh"+(r.backup?"; the old file is kept as a backup":"")+(replace?" (demo holdings replaced)":offered?demoKept(demoN):""));},e=>{if(replace&&/nothing removed/.test(errText(e)))dispatch({type:"DEMO_SETTLED"});dispatch({type:"IMPORT_SET",imp:{busy:false,msg:"could not add them: "+errText(e).slice(0,60)+(e&&e.afterPre?DEMO_GONE:"")}});});};const importChoose=dispatch=>{dispatch({type:"IMPORT_SET",imp:{busy:true,msg:"pick the file in the dialog…"}});(0,_uebersicht.run)(helper(["import","choose"])).then(out=>{const r=parseJson(String(out).trim());if(r&&r.file){dispatch({type:"IMPORT_SET",imp:{busy:false,file:r.file,text:"",rows:null,msg:null}});importPreview({imp:Object.assign({},IMPORT_EMPTY,{file:r.file})},dispatch);}else{dispatch({type:"IMPORT_SET",imp:{busy:false,msg:r&&r.cancelled?null:"no file picked"}});}},()=>dispatch({type:"IMPORT_SET",imp:{busy:false,msg:"the file dialog failed"}}));};const ImportPanel=({state,dispatch,demoKind})=>{const imp=state.imp||IMPORT_EMPTY;const rows=imp.rows||[];const shown=rows.slice(0,12);const fileName=imp.file?String(imp.file).split("/").pop():null;const okN=imp.ok||0,skipN=imp.skipped||0;return html("div",{className:(0,_uebersicht.css)(_templateObject60(),C.faint),"data-pw-import":"1"},html("div",{className:rowFlex,style:{alignItems:"baseline"}},html("span",{className:eyebrow},"import a list"),html("span",{style:{whiteSpace:"nowrap"}},html("span",{className:tabBtn,title:"pick a CSV or text file \u2014 your broker's export, for example","data-pw-import-choose":"1",onClick:()=>{if(!imp.busy)importChoose(dispatch);}},"choose a file\u2026"),html("span",{className:tabBtn,title:"back to the + form","data-pw-import-close":"1",onClick:()=>dispatch({type:"IMPORT_SET",imp:null})},"\xD7"))),fileName?html("div",{className:(0,_uebersicht.css)(_templateObject61(),mono,C.dim)},"file: "+fileName,html("span",{className:linkBtn,style:{marginLeft:6},onClick:()=>dispatch({type:"IMPORT_SET",imp:{file:null,rows:null,msg:null}})},"paste instead")):html("textarea",{className:inputCss,rows:4,value:imp.text||"","data-pw-import-text":"1",placeholder:"one holding per line, like:\nAAPL 10\nMSFT 5 at 310 on 2024-03-01\n…or paste your broker's CSV export",style:{width:"100%",boxSizing:"border-box",marginTop:4,resize:"vertical",fontFamily:'"SF Mono", Menlo, monospace',fontSize:9.5,lineHeight:1.4},onChange:ev=>dispatch({type:"IMPORT_SET",imp:{text:ev.target.value,rows:null}})}),rows.length?html("div",{className:(0,_uebersicht.css)(_templateObject62(),mono),"data-pw-import-rows":rows.length},html("div",{style:{color:C.dim}},plural(okN,"holding")+" found"+(skipN?" · "+plural(skipN,"line")+" skipped":"")),html("div",{className:rowFlex,"data-pw-import-head":"1",style:{color:C.dim,columnGap:IMPORT_COLS.gap,justifyContent:"flex-start",overflow:"hidden"}},html("span",{style:{width:IMPORT_COLS.stock,flex:"none"}},"stock"),html("span",{style:{width:IMPORT_COLS.shares,flex:"none",textAlign:"right"}},"shares"),html("span",{style:{width:IMPORT_COLS.price,flex:"none",textAlign:"right"},title:"what you paid per share \u2014 none = that day's close"},"price"),html("span",{style:{width:IMPORT_COLS.date,flex:"none"}},"date"),html("span",{style:{flex:"1 1 auto",minWidth:0,overflow:"hidden",whiteSpace:"nowrap"}},"note")),shown.map((r,i)=>html("div",{key:i,className:rowFlex,"data-pw-import-row":i,style:{color:r.ok?C.ink:C.dim,columnGap:IMPORT_COLS.gap,justifyContent:"flex-start",flexWrap:"wrap"},title:(r.note?(r.ok?"":"line "+r.line+": ")+r.note+"\n":"")+(r.text||"")},html("span",{style:{width:IMPORT_COLS.stock,flex:"none",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",color:r.ok?undefined:C.amber}},r.ticker||"—"),html("span",{style:{width:IMPORT_COLS.shares,flex:"none",textAlign:"right",whiteSpace:"nowrap"}},r.ok?fmtShares(r.shares):""),html("span",{style:{width:IMPORT_COLS.price,flex:"none",textAlign:"right",whiteSpace:"nowrap"}},r.ok?r.cost!=null?num(r.cost,2):"day's close":""),html("span",{style:{width:IMPORT_COLS.date,flex:"none",whiteSpace:"nowrap"}},r.ok?r.date||"today":""),r.note?// the reason: beside the row when it fits, else on a line of its own below it
html("span",{"data-pw-import-note":"1",style:{color:r.ok?C.dim:C.amber,flex:"1 1 150px",minWidth:0,lineHeight:1.35}},r.ok?r.note:"line "+r.line+": "+r.note):null)),rows.length>shown.length?html("div",{style:{color:C.dim}},"+ "+(rows.length-shown.length)+" more"):null):null,demoKind==="example"&&rows.length&&okN?html(DemoReplaceChips,{replace:imp.demoReplace!==false,n:demoNow(state),pick:on=>dispatch({type:"IMPORT_SET",imp:{demoReplace:on}})}):null,html("div",{className:rowFlex,style:{marginTop:6}},html("span",{className:(0,_uebersicht.css)(_templateObject63(),mono),style:{color:imp.msg&&!imp.busy?C.amber:C.dim},"data-pw-import-msg":"1"},imp.msg||(rows.length?"price = what you paid per share; none = that day's close":"ticker and shares on each line — then the price you paid and the date, if you have them")),html("span",{style:{whiteSpace:"nowrap"}},rows.length&&okN?html("span",{className:(0,_uebersicht.css)(_templateObject64(),tabBtn,tabActive),title:"write these holdings into positions.json (the old file is kept as a backup)","data-pw-import-commit":"1",onClick:()=>{if(!imp.busy)importCommit(state,dispatch,demoKind);}},"add "+plural(okN,"holding")):html("span",{className:(0,_uebersicht.css)(_templateObject65(),tabBtn,tabActive),title:"read the list and show what would be added","data-pw-import-preview":"1",onClick:()=>{if(!imp.busy)importPreview(state,dispatch);}},"preview"))));};// ---- the update offer's "yes" (13.4): widget_command.sh update run -> update.sh
const runUpdate=(upd,dispatch)=>{dispatch({type:"UPDATE_ASK",on:false});dispatch({type:"UPDATE_MSG",msg:"updating… (the widget reloads in a moment)"});(0,_uebersicht.run)(helper(["update","run"].concat(upd&&upd.zip?[upd.zip]:[]))).then(out=>{const r=parseJson(String(out).trim());if(r&&r.ok===false)dispatch({type:"UPDATE_MSG",msg:"update failed: "+String(r.message||"").slice(0,90),err:true});},e=>dispatch({type:"UPDATE_MSG",msg:"update failed: "+String(e).slice(0,60),err:true}));};// ---- the setup / no-data card's chips (13.5): widget_command.sh setup run | check
const SETUP_MSG_TICKS=36;// the card's message stays this many data ticks (about 3 min)
let setupRunAt=0;// one Terminal setup at a time: a second click within 2 min is ignored
const runSetup=dispatch=>{if(Date.now()-setupRunAt<120000){dispatch({type:"SETUP_MSG",msg:"setup is already starting — look for the Terminal window (it takes about a minute)"});return;}setupRunAt=Date.now();dispatch({type:"SETUP_MSG",msg:"opening Terminal…"});const failed=()=>(setupRunAt=0,dispatch({type:"SETUP_MSG",err:true,msg:"couldn't open Terminal — open it yourself (Spotlight → Terminal) and paste the line below"}));(0,_uebersicht.run)(helper(["setup","run"])).then(out=>{const r=parseJson(String(out).trim());if(r&&r.ok===true)dispatch({type:"SETUP_MSG",msg:"Terminal opened — come back when it says Done (if your Mac asks whether Übersicht may control Terminal, click OK)"});else failed();},failed);};const checkNow=(dispatch,text)=>{const show=()=>dispatch({type:"SETUP_MSG",msg:text});(0,_uebersicht.run)(helper(["setup","check"])).then(show,show);};// the card's message line: the last chip's answer, for about 3 minutes
const setupMsgLine=state=>{const m=state.setupMsg&&state.tick-state.setupMsg.tick<=SETUP_MSG_TICKS?state.setupMsg:null;return m?html("div",{className:(0,_uebersicht.css)(_templateObject66()),style:{color:m.err?C.amber:C.dim},"data-pw-setup-msg":"1"},m.text):null;};const setupChip=dispatch=>html("span",{className:(0,_uebersicht.css)(_templateObject67(),tabBtn,tabActive),title:"open Terminal and run install.sh there (it takes about a minute)","data-pw-setup":"run",onClick:()=>runSetup(dispatch)},"run setup in Terminal");const chipRow=(0,_uebersicht.css)(_templateObject68());// env.status "setup": Python with yfinance is missing (widget_command.sh setup_needed)
const setupCard=(state,dispatch,env)=>{const t=String(env.errorText||"");const m=t.match(/run:\s+(bash \S.*)$/m);const cmd=m?m[1].trim():t.trim();const small=(0,_uebersicht.css)(_templateObject69(),C.dim);return html("div",null,html("div",{className:(0,_uebersicht.css)(_templateObject70(),C.ink)},"This widget needs a one-time setup: Python with the yfinance package. It takes about a minute."),html("div",{className:chipRow},setupChip(dispatch),html("span",{className:(0,_uebersicht.css)(_templateObject71(),tabBtn,tabActive),title:"look for Python again right now","data-pw-setup":"check",onClick:()=>checkNow(dispatch,"checking… if setup has finished, prices appear within a minute")},"check again now")),setupMsgLine(state),html("div",{className:small},"or by hand: open Terminal (Spotlight \u2192 Terminal), paste this whole line, including bash, and press Return:"),html("div",{className:(0,_uebersicht.css)(_templateObject72())},html("span",{className:(0,_uebersicht.css)(_templateObject73(),mono),style:{color:C.ink},"data-pw-setup-cmd":"1"},cmd),html("span",{className:linkBtn,title:"copy the line, then paste it into Terminal","data-pw-setup":"copy",onClick:()=>(0,_uebersicht.run)("printf %s "+shq(cmd)+" | pbcopy").then(()=>dispatch({type:"SETUP_MSG",msg:"copied — paste it into Terminal"}),()=>dispatch({type:"SETUP_MSG",msg:"couldn't copy — select the line and copy it yourself",err:true}))},"copy")),html("div",{className:small},"The widget checks again every couple of minutes. Stuck? See Troubleshooting in the README."));};// no data and not loading: the plain reason, one fitting action, the raw log on "details"
const errorCard=(state,dispatch,env)=>{const raw=env.errorText?String(env.errorText):"";const p=raw?plainError(raw):{text:"no data yet",kind:"other"};const retry=p.kind==="other"||p.kind==="json";// never for "yahoo": it would cut the back-off short
const hasRow=retry||p.kind==="json"||p.kind==="python";return html("div",null,html("div",{className:(0,_uebersicht.css)(_templateObject74(),C.ink),"data-pw-err":"plain"},p.text),hasRow?html("div",{className:chipRow},p.kind==="python"?setupChip(dispatch):null,p.kind==="json"?html("span",{className:linkBtn,title:"show positions.json in Finder","data-pw-err":"file",onClick:()=>(0,_uebersicht.run)("open -R ".concat(shq(DIR+"/positions.json")))},"show file"):null,retry?html("span",{className:(0,_uebersicht.css)(_templateObject75(),tabBtn,tabActive),title:"ask for prices again right now","data-pw-err":"retry",onClick:()=>checkNow(dispatch,"trying again…")},"try again now"):null):null,setupMsgLine(state),raw?html("div",{className:(0,_uebersicht.css)(_templateObject76())},html("span",{className:linkBtn,title:"the widget's own last lines, for a bug report","data-pw-err":"details",onClick:()=>dispatch({type:"ERR_DETAILS"})},state.errDetails?"hide details":"details")):null,raw&&state.errDetails?html("div",{className:(0,_uebersicht.css)(_templateObject77(),C.down),"data-pw-err":"raw"},raw):null);};// ------------------------------------------------------------------ detail
const PriceChart=({series,values,refLine,w})=>{const W=w||LAYOUT_K.PRICE_W,H=LAYOUT_K.PRICE_H,PADL=40,PADR=4,PADT=6,PADB=6;// series: [[t, v], ...] (time-based); values: [v, ...] (evenly spaced)
const pts=series&&series.length>1?series.map(p=>({t:p[0],v:p[1]})):values&&values.length>1?values.map((v,i)=>({t:i,v:v})):null;if(!pts){return html("div",{className:(0,_uebersicht.css)(_templateObject78(),H,C.dim)},"no price history");}let mn=Infinity,mx=-Infinity;pts.forEach(p=>{if(p.v<mn)mn=p.v;if(p.v>mx)mx=p.v;});if(refLine!==null&&refLine!==undefined){mn=Math.min(mn,refLine);mx=Math.max(mx,refLine);}if(mx===mn){mx+=1;mn-=1;}const span0=mx-mn;mx+=span0*0.06;mn-=span0*0.06;const t0=pts[0].t,t1=pts[pts.length-1].t;const x=t=>PADL+(t-t0)/Math.max(1e-9,t1-t0)*(W-PADL-PADR);const y=v=>H-PADB-(v-mn)/(mx-mn)*(H-PADT-PADB);const nt=niceTicks(mn,mx,3);const line=pts.map(p=>x(p.t).toFixed(1)+","+y(p.v).toFixed(1)).join(" ");const area="M"+x(t0).toFixed(1)+","+(H-PADB)+" L"+line.replace(/ /g," L")+" L"+x(t1).toFixed(1)+","+(H-PADB)+" Z";const last=pts[pts.length-1];return html("svg",{width:W,height:H},nt.ticks.map(tv=>html("g",{key:tv},html("line",{x1:PADL,y1:crisp(y(tv)),x2:W-PADR,y2:crisp(y(tv)),stroke:C.grid,strokeWidth:"1",shapeRendering:"crispEdges"}),html("text",{x:PADL-5,y:crisp(y(tv))+3,textAnchor:"end",fill:C.dim,fontSize:"8",fontFamily:"\"SF Mono\", Menlo, monospace"},num(tv,nt.step<1?2:0)))),html("path",{d:area,fill:C.line,opacity:paletteNow().areaAlpha}),refLine!==null&&refLine!==undefined?html("line",{x1:PADL,y1:crisp(y(refLine)),x2:W-PADR,y2:crisp(y(refLine)),stroke:C.dim,strokeWidth:"1",opacity:"0.45",shapeRendering:"crispEdges"}):null,html("polyline",_extends({points:line,fill:"none",stroke:C.line,strokeWidth:"1.25"},LINE_STYLE)),html("circle",{cx:x(last.t).toFixed(1),cy:y(last.v).toFixed(1),r:"1.8",fill:C.ink}));};const statRow=(0,_uebersicht.css)(_templateObject79());const rowFromLook=ld=>({ticker:ld.symbol,name:ld.name,theme:ld.exchange||"",price:ld.price,currency:ld.currency,dayChangePct:ld.dayChangePct,dayChange:ld.dayChange,changes:ld.changes,spark:ld.spark,volPct:ld.volPct,volScore:ld.volScore,earningsDate:ld.earningsDate,stale:ld.stale});// % change over a detail range: the tracker's figure where it has one,
// else first→last of the fetched series
const rangeChangeOf=(p,ld,range)=>{if(p.changes&&typeof p.changes[range]==="number")return p.changes[range];const ser=ld&&ld.series&&ld.series[range];if(ser&&ser.length>1&&ser[0][1])return(ser[ser.length-1][1]/ser[0][1]-1)*100;return null;};const StockDetail=({p,earn,look,range,dispatch,tg,chartW})=>{// tg: its target bucket (12.10, only with targets)
const held=p.shares!==undefined&&p.shares!==null;const away=daysAway(p.earningsDate);const exAway=typeof p.exDividendDate==="string"?daysAway(p.exDividendDate):null;// 12.7+
const ld=look&&look.ticker===p.ticker?look.data:null;let series=null;if(ld&&ld.series){series=ld.series[range]||null;if(range==="1H"&&ld.series["1D"]){const day=ld.series["1D"];const cutoff=day.length?day[day.length-1][0]-3600:0;series=day.filter(q=>q[0]>=cutoff);}}const refLine=ld&&(range==="1D"||range==="1H")?ld.prevClose:null;const caption=series&&series.length>1?series.length+" points · "+(range==="1H"||range==="1D"?"5-min bars":range==="1W"||range==="1M"?"hourly closes":"daily closes"):look&&look.busy?"loading full chart…":look&&look.error?look.error:"last "+(p.spark?p.spark.length:0)+" sessions · daily closes";const chg=rangeChangeOf(p,ld,range);return html("div",null,html("div",{className:rowFlex,style:{marginTop:4}},html("span",{className:mono,style:{fontSize:18}},num(p.price,2)," ",html("span",{style:{fontSize:9,color:C.dim}},p.currency)),html("span",{className:mono,style:{fontSize:11,color:upDown(p.dayChangePct||0)},title:"today"},pct(p.dayChangePct)," \xB7 ",held?signedMoney(p.dayChangeValue):(p.dayChange>=0?"+":"−")+num(Math.abs(p.dayChange||0),2))),html("div",{className:rowFlex,style:{marginTop:5}},html("span",null,DETAIL_RANGES.map(r=>html("span",{key:r,className:r===range?(0,_uebersicht.css)(_templateObject80(),tabBtn,tabActive):tabBtn,style:{padding:"2px 5px"},onClick:()=>dispatch({type:"SET_DETAIL_RANGE",range:r})},r))),html("span",{className:mono,style:{fontSize:10,color:chg===null?C.dim:upDown(chg)}},pct(chg))),html("div",{style:{marginTop:4}},html(PriceChart,{series:series,values:series?null:p.spark,refLine:refLine,w:chartW})),html("div",{className:(0,_uebersicht.css)(_templateObject81(),mono,C.dim)},caption,refLine!==null&&series&&series.length>1?" · grey line = previous close":""),html("div",{className:(0,_uebersicht.css)(_templateObject82(),statRow,mono),style:{marginTop:8},title:volTip(p.volPct,p.volScore)},html("span",{style:{color:C.dim,whiteSpace:"nowrap"}},"volatility"),html("span",null,p.volScore?html("span",null,html("span",{style:{color:volColor(p.volScore)}},p.volScore,"/10 ",VOL_LABEL[p.volScore])," · "+p.volPct+"%/yr ",html(VolMeter,{score:p.volScore})):"not enough history")),held?html("div",null,html("div",{className:(0,_uebersicht.css)(_templateObject83(),statRow,mono)},html("span",{style:{color:C.dim}},"position",p.undated===true?html("span",{title:"no purchase date \u2014 counted as held for the whole graph (backtestYears in _settings)"}," \xB7 undated"):null),html("span",null,p.shares," sh \xB7 ",money(p.value)," \xB7 ",p.weightPct,"%")),tg?html("div",{className:(0,_uebersicht.css)(_templateObject84(),statRow,mono),title:"target mix — ±"+tg.band+" pt band"},html("span",{style:{color:C.dim}},tg.kind==="sector"?tg.key+" sector":"target"),html("span",null,fmtTarget(tg.targetPct)+" · drift ",html("span",{style:{color:tg.state==="over"?C.orange:C.ink}},fmtPts(tg.driftPct)+" pts"))):null,html("div",{className:(0,_uebersicht.css)(_templateObject85(),statRow,mono),title:p.basisDerived?"≈ = no purchase price given, so the close on your buy date is used":""},html("span",{style:{color:C.dim}},"cost basis",p.basisDerived?" ≈":""),html("span",null,money(p.costBasis))),html("div",{className:(0,_uebersicht.css)(_templateObject86(),statRow,mono)},html("span",{style:{color:C.dim}},"P&L"),html("span",{style:{color:upDown(p.pl||0)}},signedMoney(p.pl)," (",pct(p.plPct),")")),html("div",{className:(0,_uebersicht.css)(_templateObject87(),statRow,mono),title:"today's change split into the price move and the exchange-rate move"},html("span",{style:{color:C.dim}},"today \xB7 price / fx"),html("span",null,signedMoney(p.priceEffect)," / ",signedMoney(p.fxEffect)))):html("div",{className:(0,_uebersicht.css)(_templateObject88(),statRow,mono),title:"1H \xB7 1D \xB7 1W \xB7 1M \xB7 1Y"},html("span",{style:{color:C.dim,whiteSpace:"nowrap"}},"moves"),html("span",null,RANGES.map(r=>html("span",{key:r,style:{marginLeft:6,color:upDown(p.changes&&p.changes[r]||0)}},pct(p.changes?p.changes[r]:null))))),html("div",{className:(0,_uebersicht.css)(_templateObject89(),statRow,mono),title:"\xB1 = the move options traders are pricing in for the earnings report"},html("span",{style:{color:C.dim}},"earnings"),html("span",null,p.earningsDate?fmtDate(p.earningsDate)+(away!==null&&away>=0?" ("+(away===0?"today":away+"d")+")":""):"—",earn&&earn.impliedMovePct!==null&&earn.impliedMovePct!==undefined?" ±"+earn.impliedMovePct+"%":"")),html("div",{className:(0,_uebersicht.css)(_templateObject90(),statRow,mono)},html("span",{style:{color:C.dim}},"dividends"),html("span",null,held?p.dividendAnnual?"~"+money(p.dividendAnnual)+"/yr":"—":ld&&ld.dividendRate?num(ld.dividendRate,2)+" "+p.currency+"/sh/yr":"—",exAway!==null&&exAway>=0?html("span",{style:{color:exAway<=7?C.amber:C.dim},title:"announced ex-dividend date \u2014 own the shares before it to get the payment"}," · ex "+fmtDate(p.exDividendDate)+" ("+(exAway===0?"today":exAway+"d")+")"):null)),held&&isFin(p.dividendsReceived)&&p.dividendsReceived>0?html("div",{className:(0,_uebersicht.css)(_templateObject91(),statRow,mono),title:"dividends paid on the shares held before each ex-dividend date (dated lots only)"},html("span",{style:{color:C.dim}},"received"),html("span",null,money(p.dividendsReceived))):null,p.stale?html("div",{className:(0,_uebersicht.css)(_templateObject92(),C.down)},"! last known price \u2014 the latest fetch failed for this ticker"):null);};// ------------------------------------------------------------------ sales · income · ex-dividends
// every read here is guarded: data.json from before 12.7 has none of these fields
const isFin=v=>typeof v==="number"&&isFinite(v);// "Mar 14" this year, "Mar 14, 2025" otherwise
const fmtIsoY=iso=>{if(typeof iso!=="string"||!/^\d{4}-\d\d-\d\d$/.test(iso))return"—";return iso.slice(0,4)===String(new Date().getFullYear())?fmtDate(iso):fmtIsoLong(iso);};// ------------------------------------------------------------------ 12.8: returns · drawdown · 52-week high
// every read is guarded: data.json from before 12.8 has no performance, risk.real/backtest or high52
// signed, 1 dp ("+9.1%", "−4.7%"); "—" when unknown
const pct1=v=>{if(!isFin(v))return"—";const r=Math.round(v*10)/10;return(r>0?"+":r<0?"−":"")+Math.abs(r).toFixed(1)+"%";};// 2 dp with a real minus sign (like pct1), no "-0.00"; "—" when unknown
const num2=v=>isFin(v)?num(Math.round(v*100)/100||0,2).replace(/^-/,"−"):"—";// the header's return line is shown only when the tracker says the history is complete
const perfShown=perf=>!!(perf&&perf.ok===true&&isFin(perf.totalPct));// 13.6: the goal (⚙ → Portfolio → a goal to reach; data.json ui.goal). The
// projection grows the holdings at the annual return so far (XIRR) and keeps
// cash flat, and only after GOAL_MIN_DAYS of history; every read is guarded
const GOAL_MIN_DAYS=365;const goalOf=d=>{const g=d&&d.ui&&d.ui.goal;if(!g||typeof g!=="object"||!isFin(g.value)||!(g.value>0)||typeof g.date!=="string"||!/^\d{4}-\d\d-\d\d$/.test(g.date))return null;return{value:g.value,date:g.date,cur:g.cur||d.currency};};const goalView=d=>{const g=goalOf(d);if(!g)return null;const factor=g.cur===d.currency?1:d.fxRates&&isFin(d.fxRates[g.cur])?d.fxRates[g.cur]:null;if(factor===null)return{g:g,noRate:true};const goal=g.value*factor;const now=d.totals&&d.totals.value||0;const cash=isFin(d.cash)?d.cash:0;const today=isoOf(Date.now()/1000);const years=(Date.parse(g.date)-Date.parse(today))/(365.25*864e5);const pctNow=Math.floor(now/goal*100);const reached=now>=goal,passed=g.date<=today;const perf=d.performance&&typeof d.performance==="object"?d.performance:null;let proj=null,onTrack=null,shortPct=null,need=null,why=null;if(!reached&&!passed&&perfShown(perf)&&isFin(perf.xirrPct)&&isFin(perf.days)&&perf.days>=GOAL_MIN_DAYS){const r=perf.xirrPct/100;proj=Math.max(0,now-cash)*Math.pow(1+r,years)+cash;onTrack=proj>=goal;shortPct=Math.ceil((goal-proj)/goal*100);need=now-cash>0&&goal>cash?(Math.pow((goal-cash)/(now-cash),1/years)-1)*100:null;}else why=perfShown(perf)&&isFin(perf.days)&&perf.days<GOAL_MIN_DAYS?"young":"norate";return{g:g,goal:goal,now:now,cash:cash,pctNow:pctNow,reached:reached,passed:passed,proj:proj,onTrack:onTrack,shortPct:shortPct,need:need,why:why,xirr:perf&&perf.xirrPct,since:perf&&perf.since};};// "2035" for a year alone (Dec 31), else "Jun 2035"
const byLabel=iso=>/-12-31$/.test(iso)?iso.slice(0,4):new Date(iso+"T12:00:00").toLocaleDateString(LOCALE,{month:"short",year:"numeric"});// hover line for a holding: "52-week closing high 181.20 USD (Mar 3) · −4.20% from it"; "" when absent
const high52Tip=p=>{if(!p||!isFin(p.high52))return"";const at=p.high52Date?" ("+fmtIsoY(p.high52Date)+")":"";const from=!isFin(p.fromHigh52Pct)?"":p.fromHigh52Pct>-0.005?" · at its 52-week high":" · "+pct(p.fromHigh52Pct)+" from it";return"52-week closing high "+num(p.high52,2)+(p.currency?" "+p.currency:"")+at+from;};// why the real risk figures are hidden (performance.ok false); null = say nothing
const perfWhy=perf=>{if(!perf||typeof perf!=="object")return null;const min=isFin(perf.minDays)?perf.minDays:30;// ok, but the priced holdings' own span is still short (an old sale made `since` old)
if(perf.ok===true&&!isFin(perf.twrPct)&&isFin(perf.twrDays)&&perf.twrDays<min)return"drawdown, beta and sharpe appear after "+min+" days (day "+perf.twrDays+")";if(perf.ok!==false)return null;const what="drawdown, beta, sharpe and the annual return ";switch(perf.reason){case"young":return what+"appear after "+min+" days"+(isFin(perf.days)?" (day "+perf.days+")":"");case"undated":return what+"need purchase dates";case"loading":return what+"appear after the price history loads";case"cost":return what+"need a purchase price for every lot";case"sales":return what+"need a purchase and sale price for every recorded sale";default:return null;}};// the earnings list with the announced ex-dividend dates merged in, by date
// (earnings first on a tie); each item gets a kind: "earn" or "exdiv"
const calendarOf=d=>{const items=[];(Array.isArray(d.earnings)?d.earnings:[]).forEach(e=>{if(e&&typeof e.ticker==="string")items.push(Object.assign({},e,{kind:"earn"}));});(Array.isArray(d.exDividends)?d.exDividends:[]).forEach(e=>{if(e&&typeof e.ticker==="string"&&typeof e.date==="string")items.push(Object.assign({},e,{kind:"exdiv"}));});if(items.length===0||items.every(e=>e.kind==="earn"))return items;// old data: order untouched
return items.map((e,i)=>[e,i]).sort((a,b)=>{const da=a[0].date||"9999",db=b[0].date||"9999";return da<db?-1:da>db?1:a[1]-b[1];}).map(x=>x[0]);};const exDivTip=e=>"ex-dividend date — own the shares before it to get the payment"+(isFin(e.amountPerShare)?"\n"+num(e.amountPerShare,e.amountPerShare<0.1?4:2)+" "+(e.currency||"")+" per share (the last payment)":"")+(isFin(e.value)?"\n≈ "+money(e.value,true)+" for the shares you hold":"");const SALES_ROWS=5;const CUR_ROWS=6;// 13.6: currencies panel rows before "+N more"
// why the currency move since purchase is not known (currencies.why / rows[].why)
const WHY_TXT={undated:"needs a purchase date on every holding in this currency",cost:"a holding has no purchase price",loading:"older exchange rates are still loading",norate:"no exchange-rate history yet"};const SalesPanel=({d,totals,expanded,dispatch,first,pw})=>{const sales=Array.isArray(d.sales)?d.sales.filter(s=>s&&typeof s.ticker==="string"):[];if(sales.length===0)return null;const shown=expanded?sales:sales.slice(0,SALES_ROWS);const count=isFin(d.salesCount)?d.salesCount:sales.length;const unknown=isFin(d.salesUnknown)?d.salesUnknown:0;return html("div",_extends({className:first?"":sectionGap},pw||{}),html("div",{className:rowFlex},html("span",{className:eyebrow,title:"sales recorded by the sell button / remove_position.py \xB7 gain = sale price \u2212 purchase price, oldest shares sold first, no fees"},"sales \xB7 realized"),isFin(totals.realized)?html("span",{className:mono,style:{fontSize:9,color:upDown(totals.realized)},title:"realized gain of all recorded sales"},signedMoney(totals.realized)):null),shown.map((s,i)=>{const known=isFin(s.gain);const disp=isFin(s.gainDisplay);const why=!isFin(s.basis)?"no purchase price":!isFin(s.proceeds)?"no sale price":"gain unknown";return html("div",{key:s.ticker+"|"+(s.date||"")+"|"+i,className:rowFlex,style:{marginTop:3}},html("span",{className:mono,style:{fontSize:9.5}},html("span",{style:{color:C.dim}},fmtIsoY(s.date)," "),s.ticker,html("span",{style:{color:C.dim}},isFin(s.shares)?" "+fmtShares(s.shares)+" sh":"")),!known?html("span",{className:mono,style:{fontSize:9.5,color:C.dim},title:why},"\u2014"):html("span",{className:mono,style:{fontSize:9.5,color:upDown(s.gain)},title:(isFin(s.proceeds)?"sold for "+num(s.proceeds,2)+" "+(s.currency||""):"")+(isFin(s.basis)?"\npaid "+num(s.basis,2)+" "+(s.currency||""):"")+(disp?"":"\nno exchange rate — gain shown in "+(s.currency||"the stock's currency"))},disp?signedMoney(s.gainDisplay):(s.gain>=0?"+":"−")+num(Math.abs(s.gain),2)+" "+(s.currency||""),isFin(s.gainPct)?html("span",{style:{color:C.dim}}," (",pct(s.gainPct),")"):null));}),html("div",{className:rowFlex,style:{marginTop:4}},html("span",{className:(0,_uebersicht.css)(_templateObject93(),mono,C.dim),title:unknown>0?"sales without a purchase price, a sale price or an exchange rate are not in the realized total":""},count+(count===1?" sale":" sales"),unknown>0?" · "+unknown+" without a known gain (not counted)":""),sales.length>SALES_ROWS?html("span",{className:linkBtn,style:{fontSize:8},onClick:()=>dispatch({type:"SET_SALES_EXPANDED",on:!expanded})},expanded?"fewer":"all "+sales.length+" ›"):null));};const monthOf=m=>{// "2026-09" -> Date in that month
const mm=/^(\d{4})-(\d\d)$/.exec(typeof m==="string"?m:"");return mm?new Date(Number(mm[1]),Number(mm[2])-1,15,12):null;};// 13.6: the income panel's views. "bars" always works; "next" and "years" need
// data.json's dividends.upcoming / .years (absent from 13.5's data: no switch then)
const INCOME_NEXT_ROWS=4;const incomeViews=dv=>({next:!!dv&&Array.isArray(dv.upcoming),years:!!dv&&Array.isArray(dv.years)});const incomeViewOf=(state,dv)=>{const ok=incomeViews(dv);const v=state.incomeView;return v==="next"&&ok.next||v==="years"&&ok.years?v:"bars";};const incomeNext=dv=>(dv&&Array.isArray(dv.upcoming)?dv.upcoming:[]).filter(e=>e&&typeof e.ticker==="string"&&typeof e.exDate==="string");const incomeYears=dv=>(dv&&Array.isArray(dv.years)?dv.years:[]).filter(y=>y&&isFin(y.y));// the panel's height below the eyebrow, per view (est["panel.income"])
const incomeH=(dv,view,K)=>{const ok=incomeViews(dv);let h=K.INCOME+(ok.next||ok.years?K.INCOME_TABS:0);if(view==="bars")return h;let body;if(view==="next"){const n=incomeNext(dv).length;body=n?Math.min(n,INCOME_NEXT_ROWS)*K.INCOME_ROW+(n>INCOME_NEXT_ROWS?K.INCOME_ROW:0):K.INCOME_ROW;}else{const early=dv&&isFin(dv.receivedEarlier)&&dv.receivedEarlier>0?1:0;body=Math.max(1,incomeYears(dv).length+early)*K.INCOME_ROW;}return h-K.INCOME_BARS+3+body;};const INCOME_TABS=[{key:"bars",label:"12 months",tip:"the next 12 months, estimated from the last year of payments × the shares you hold now"},{key:"next",label:"next dates",tip:"the next ex-dividend dates: own the shares before that day to get the payment; expected = not announced yet, about a year after last year's"},{key:"years",label:"by year",tip:"dividends your shares earned in each calendar year (by ex-dividend date), at today's exchange rate"}];// "next": the soonest ex-dividend dates of holdings (dv.upcoming, 90 days)
const incomeNextTip=e=>{const per=isFin(e.perShare)?"\n"+num(e.perShare,e.perShare<0.1?4:2)+" "+(e.currency||"")+" per share"+(e.est?" (last year's)":" (the last payment)"):"";return(e.est?"expected — about a year after last year's payment; the company has not announced it yet":"ex-dividend date — own the shares before it to get the payment")+(e.payDate?"\npaid on "+fmtIsoY(e.payDate):"")+per+(isFin(e.amount)?"\nabout "+money(e.amount,true)+" for the shares you hold":"");};const incomeNextRows=(dv,line,dim)=>{const all=incomeNext(dv);const rest=all.slice(INCOME_NEXT_ROWS);return html("div",{style:{marginTop:3}},all.length?all.slice(0,INCOME_NEXT_ROWS).map((e,i)=>html("div",{key:e.ticker+"|"+e.exDate+"|"+i,className:rowFlex+" "+line,style:{marginTop:i?2:0},"data-pw-incrow":"next",title:incomeNextTip(e)},html("span",{style:{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}},html("span",{style:{color:C.dim}},fmtIsoY(e.exDate)+" "),e.ticker,html("span",{style:{color:C.dim}},e.payDate?" · paid "+fmtIsoY(e.payDate):e.est?" · expected":"")),html("span",{style:{whiteSpace:"nowrap",marginLeft:6}},isFin(e.amount)?"~"+money(e.amount,true):"—"))):html("div",{className:dim},"no ex-dividend dates known for the next 90 days"),rest.length?html("div",{className:dim,style:{marginTop:2},title:rest.map(e=>e.ticker+" "+fmtIsoY(e.exDate)).join("\n")},"+"+rest.length+" more in the next 90 days"):null);};// "years": received per calendar year of the ex-date (dv.years, newest first)
const incomeYearRows=(dv,line,dim)=>{const ys=incomeYears(dv);const top=ys.reduce((mx,y)=>Math.max(mx,isFin(y.received)?y.received:0),0);const early=isFin(dv.receivedEarlier)&&dv.receivedEarlier>0?dv.receivedEarlier:0;const oldest=ys.length?ys[ys.length-1].y:null;return html("div",{style:{marginTop:3}},ys.length?ys.map((y,i)=>{const r=isFin(y.received)?y.received:0;const w=top>0&&r>0?"max(1px, "+Math.round(r/top*1000)/10+"%)":0;const n=isFin(y.payers)?y.payers:0;return html("div",{key:y.y,className:rowFlex+" "+line,style:{marginTop:i?2:0},"data-pw-incrow":"year",title:y.y+": "+money(r,true)+" from "+n+(n===1?" holding":" holdings")},html("span",{style:{whiteSpace:"nowrap"}},y.y+(y.ytd?" so far":"")),html("span",{style:{flex:1,margin:"0 6px",height:3,alignSelf:"center",display:"flex"}},html("span",{style:{width:w,height:3,background:C.line,opacity:0.8}})),html("span",{style:{whiteSpace:"nowrap"}},money(r),html("span",{style:{color:C.dim}},n?" · "+n+(n===1?" payer":" payers"):"")));}):html("div",{className:dim},"received dividends need purchase dates \u2014 add the date you bought each holding"),early&&oldest!==null?html("div",{className:rowFlex+" "+dim,style:{marginTop:2},"data-pw-incrow":"year"},html("span",null,"before "+oldest),html("span",null,money(early))):null);};const INCOME_BAR_H=22;const IncomePanel=({d,view,dispatch,first,pw})=>{const dv=d.dividends;if(!dv||typeof dv!=="object"||Array.isArray(dv))return null;const months=(Array.isArray(dv.months)?dv.months:[]).slice(0,12).map(b=>({m:b&&b.m,amount:b&&isFin(b.amount)&&b.amount>0?b.amount:0}));const top=months.reduce((mx,b)=>Math.max(mx,b.amount),0);const fallback=Array.isArray(dv.fallback)?dv.fallback.filter(t=>typeof t==="string"):[];const ok=incomeViews(dv);const v=view==="next"&&ok.next?"next":view==="years"&&ok.years?"years":"bars";// read at render time (the theme can change); dimMono lives in renderWin only
const incSwitch=(0,_uebersicht.css)(_templateObject94(),mono,C.dim);const incLine=(0,_uebersicht.css)(_templateObject95(),mono);const incDim=(0,_uebersicht.css)(_templateObject96(),mono,C.dim);const incNextBody=v==="next"?incomeNextRows(dv,incLine,incDim):null;const incYearsBody=v==="years"?incomeYearRows(dv,incLine,incDim):null;return html("div",_extends({className:first?"":sectionGap},pw||{}),html("div",{className:rowFlex},html("span",{className:eyebrow,title:"dividends \u2014 the next 12 months estimated from the last year of payments \xD7 the shares you hold now"},"income \xB7 dividends"),html("span",{className:mono,style:{fontSize:9.5}},"~",money(dv.annual),"/yr")),html("div",{className:(0,_uebersicht.css)(_templateObject97(),mono,C.dim),style:{marginTop:3},title:"yield = yearly dividends ÷ portfolio value · on cost = ÷ what the holdings cost"+(fallback.length?"\nno payment history, estimated from the yearly rate: "+fallback.join(", "):"")},"yield ",isFin(dv.yieldPct)?num(dv.yieldPct,2)+"%":"—"," · on cost ",isFin(dv.yieldOnCostPct)?num(dv.yieldOnCostPct,2)+"%":"—",isFin(dv.payers)?" · "+dv.payers+(dv.payers===1?" payer":" payers"):""),ok.next||ok.years?html("div",{className:incSwitch,style:{marginTop:3,height:11,lineHeight:"11px",whiteSpace:"nowrap"}},INCOME_TABS.filter(t=>t.key==="bars"||ok[t.key]).map((t,i)=>html("span",{key:t.key},i?" | ":"",html("span",{className:linkBtn,style:{fontSize:8,color:v===t.key?C.ink:C.dim},"data-pw-income":t.key,title:t.tip,onClick:()=>dispatch&&dispatch({type:"SET_INCOME_VIEW",view:t.key})},t.label)))):null,v==="next"?incNextBody:v==="years"?incYearsBody:months.length?html("div",{style:{display:"flex",alignItems:"flex-end",marginTop:5}},months.map((b,i)=>{const dt=monthOf(b.m);const h=top>0&&b.amount>0?Math.max(2,Math.round(b.amount/top*INCOME_BAR_H)):1;return html("div",{key:(b.m||"")+"|"+i,style:{flex:1,textAlign:"center",padding:"0 1px"},title:(dt?dt.toLocaleDateString(LOCALE,{month:"long",year:"numeric"}):"")+" · ~"+money(b.amount,true)+(i===0?" (this month)":"")},html("div",{style:{height:INCOME_BAR_H,display:"flex",alignItems:"flex-end"}},html("div",{style:{width:"100%",height:h,borderRadius:b.amount>0?1:0,background:b.amount>0?C.line:C.faint,opacity:b.amount>0?0.8:1}})),html("div",{className:mono,style:{fontSize:7.5,color:i===0?C.ink:C.dim,marginTop:1}},dt?dt.toLocaleDateString(LOCALE,{month:"narrow"}):"·"));})):null,isFin(dv.received)?html("div",{className:(0,_uebersicht.css)(_templateObject98(),mono,C.dim),style:{marginTop:3},title:"dividends paid on the shares you held before each ex-dividend date"+(dv.receivedPartial?"\nholdings without a purchase date are not counted (their start is unknown)":"")+"\nholdings you sold completely, and sales recorded before 12.7, are not counted"},"received ",html("span",{style:{color:C.ink}},money(dv.received)),typeof dv.receivedSince==="string"?" since "+fmtIsoY(dv.receivedSince):"",dv.receivedPartial===true?" · dated lots only":""):null);};// ------------------------------------------------------------------ currencies (13.6)
// d.currencies (portfolio_tracker.currency_exposure): each currency's share of
// the portfolio (cash included) and what currency moves did today and since
// each purchase. Stateless: hover tooltips only.
const curTipOf=(r,cx)=>{const own=r.iso===cx.display;return[r.iso+": "+num(r.pct,1)+"% of the portfolio"+(r.holdings?" · "+r.holdings+(r.holdings===1?" holding":" holdings"):"")+(r.cash?" · "+money(r.cash)+" cash":""),own?"your display currency, so currency moves don't change it":"1 "+r.iso+" = "+num(r.rate,4)+" "+cx.display+" today ("+pct(r.rateDayPct)+")","today: prices "+signedMoney(r.dayPrice)+(own?"":" · currency move "+signedMoney(r.dayFx)),"since you bought: prices "+signedMoney(r.pl)+(own?"":isFin(r.fxSince)?" · currency move "+signedMoney(r.fxSince)+(isFin(r.rateBuy)?" (you bought at about "+num(r.rateBuy,4)+" "+cx.display+" per "+r.iso+" on average)":""):" · currency move: "+(WHY_TXT[r.why]||"not known yet"))].join("\n");};const CurrenciesPanel=({d,w,first,pw})=>{const cx=d.currencies;if(!cx||typeof cx!=="object"||Array.isArray(cx)||!Array.isArray(cx.rows))return null;const rows=cx.rows.filter(r=>r&&typeof r.iso==="string");return html("div",_extends({className:first?"":sectionGap},pw||{}),html("div",{className:rowFlex},html("span",{className:eyebrow,title:"how much of the portfolio sits in each currency (cash included), and how currency moves changed its value"},"currencies"),html("span",{className:mono,"data-pw-cur-total":"1",style:{fontSize:9.5,color:upDown(cx.dayFx||0)},title:"today's change from currency moves (cash not counted, as in the header)"},"currency move today "+signedMoney(cx.dayFx))),rows.slice(0,CUR_ROWS).map(r=>{const own=r.iso===cx.display;return html("div",{key:r.iso,className:rowFlex,style:{marginTop:3},"data-pw-cur":r.iso,title:curTipOf(r,cx)},html("span",{style:{fontSize:10,width:34,whiteSpace:"nowrap"}},r.iso),html("div",{className:(0,_uebersicht.css)(_templateObject99())},html("div",{style:{width:Math.max(0,Math.min(100,isFin(r.pct)?r.pct:0))+"%",height:"100%",background:C.line,borderRadius:2,opacity:own?0.5:1}})),html("span",{className:mono,style:{fontSize:9,width:44,textAlign:"right"}},num(r.pct,1)+"%"),w&&w<260?null:html("span",{className:mono,style:{fontSize:9,color:C.dim,width:62,textAlign:"right"}},money(r.value)),html("span",{className:mono,style:{fontSize:9,width:56,textAlign:"right",color:own?C.dim:upDown(r.dayFx||0)}},own?"·":signedMoney(r.dayFx)));}),rows.length>CUR_ROWS?html("div",{className:(0,_uebersicht.css)(_templateObject100(),mono,C.dim),style:{marginTop:2},"data-pw-cur-more":"1",title:rows.slice(CUR_ROWS).map(r=>r.iso+" "+num(r.pct,1)+"%").join(" · ")},"+"+(rows.length-CUR_ROWS)+" more"):null,html("div",{className:(0,_uebersicht.css)(_templateObject101(),mono,C.dim),style:{marginTop:4},"data-pw-cur-day":"1",title:"what today's change is made of: the share prices moving, and the currencies moving against "+cx.display},"today: prices "+signedMoney(cx.dayPrice)+" · currency moves "+signedMoney(cx.dayFx)),html("div",{className:(0,_uebersicht.css)(_templateObject102(),mono,C.dim),style:{marginTop:2},"data-pw-cur-since":"1",title:"the gain on what you hold now, in two parts: what the share prices did (counted at today's exchange rates, as in the P&L in the header)"+" and what currency moves since each purchase added or took away"+(isFin(cx.plFx)?"\ntogether: "+signedMoney(cx.plFx):"\ncurrency moves: "+(WHY_TXT[cx.why]||"not known yet"))},"since you bought: prices "+signedMoney(cx.pl)+" · currency moves "+(isFin(cx.fxSince)?signedMoney(cx.fxSince):"—")));};// ------------------------------------------------------------------ rebalance (12.10)
// Only with _settings.targets (d.targets an object). The tracker computes
// everything (fewest dollars moved to get every bucket within ±band); this
// only shows the chosen plan: whole shares or fractional.
const REBAL_ROWS=5;const REBAL_REASON={noPrice:"waiting for prices",empty:"nothing to rebalance yet",infeasible:"these targets can't all be met within ±{band} pt"};const saveRebalWhole=(on,dispatch)=>{dispatch({type:"SET_REBAL_WHOLE",on:on});// null = "default": the key is removed, the widget chooses (13.2)
return saveSetting("rebalanceWhole",on===true?"true":on===false?"false":"default",dispatch);};const buyList=buys=>(Array.isArray(buys)?buys:[]).filter(b=>b&&isFin(b.amount)).map(b=>b.key+" "+money(b.amount,true)).join("\n");const RebalancePanel=({d,state,dispatch,first,pw})=>{const tg=d.targets;if(!tg||typeof tg!=="object"||Array.isArray(tg))return null;const on=tg.set===true;const band=bandOf(d);const warns=(Array.isArray(tg.warnings)?tg.warnings:[]).filter(w=>w&&typeof w.text==="string");const rb=on&&tg.rebalance&&typeof tg.rebalance==="object"?tg.rebalance:null;const whole=wholeOf(state,d);const plan=rb&&rb.ok?whole?rb.whole||rb.fractional:rb.fractional||rb.whole:null;const trades=plan&&Array.isArray(plan.trades)?plan.trades.filter(t=>t&&typeof t.ticker==="string"):[];const shown=state.rebalExpanded?trades:trades.slice(0,REBAL_ROWS);const off=targetBuckets(d).filter(b=>b.state==="over"||b.state==="under").slice(0,4);const nm=on&&tg.newMoney&&typeof tg.newMoney==="object"?tg.newMoney:null;const order=nm&&Array.isArray(nm.order)?nm.order.filter(o=>o&&typeof o.key==="string"):[];const ns=nm&&nm.noSell&&typeof nm.noSell==="object"?nm.noSell:null;const nsBuys=ns&&Array.isArray(ns.buys)?ns.buys:[];const line=(0,_uebersicht.css)(_templateObject103(),mono,C.dim);return html("div",_extends({className:first?"":sectionGap},pw||{}),html("div",{className:rowFlex},html("span",{className:eyebrow,style:{cursor:"pointer"},"data-pw-rebal-edit":"1",onClick:()=>dispatch({type:"OPEN_EDITOR",group:"portfolio"}),title:"your target mix (⚙ → Portfolio → target mix): the fewest dollars of trades that bring every holding, sector and cash within ±"+band+" percentage point of its target"},"rebalance · ±"+band+" pt"),on?html("span",null,[["whole",true],["fractional",false]].map(([label,v])=>html("span",{key:label,className:whole===v?(0,_uebersicht.css)(_templateObject104(),tabBtn,tabActive):tabBtn,title:v?"whole shares only (cash takes the rest)":"fractional shares",onClick:()=>saveRebalWhole(v,dispatch)},label))):null),warns.slice(0,3).map((w,i)=>html("div",{key:(w.kind||"")+"|"+i,className:(0,_uebersicht.css)(_templateObject105(),mono,C.amber)},w.text)),warns.length>3?html("div",{className:(0,_uebersicht.css)(_templateObject106(),mono,C.amber),title:warns.slice(3).map(w=>w.text).join("\n")},"+"+(warns.length-3)+" more"):null,!on?null:!rb||!rb.ok?html("div",{className:line},(rb&&REBAL_REASON[rb.reason]||"no suggestion yet").replace("{band}",band)):rb.inBand?html("div",{className:line},"all within ±"+band+" pt of target — nothing to trade"):html("div",null,shown.map((t,i)=>html("div",{key:t.side+"|"+t.ticker+"|"+i,className:rowFlex,style:{marginTop:3},title:(isFin(t.price)?"at "+num(t.price,2)+" "+(t.currency||""):"")+(typeof t.bucket==="string"&&t.bucket!==t.ticker?"\nfor the "+t.bucket+" target":"")},html("span",{className:mono,style:{fontSize:9.5}},html("span",{style:{color:t.side==="sell"?C.orange:C.line}},t.side==="sell"?"sell":"buy")," "+(isFin(t.shares)?fmtShares(t.shares):"—")+" "+t.ticker),html("span",{className:mono,style:{fontSize:9.5}},money(t.value)))),html("div",{className:rowFlex,style:{marginTop:4}},html("span",{className:(0,_uebersicht.css)(_templateObject107(),mono,C.dim),title:"money moved = everything bought (or everything sold); no fees or taxes"},"moves "+money(plan.moved)+(isFin(plan.cashChange)&&Math.abs(plan.cashChange)>=0.005?" · cash "+signedMoney(plan.cashChange):"")),trades.length>REBAL_ROWS?html("span",{className:linkBtn,style:{fontSize:8},onClick:()=>dispatch({type:"TOGGLE_REBAL_EXPANDED"})},state.rebalExpanded?"fewer":"all "+trades.length):null),plan.withinBand===false?html("div",{className:(0,_uebersicht.css)(_templateObject108(),mono,C.amber),title:"whole shares only, never spending more cash than you have"},trades.length?"no whole-share plan found within ±"+band+" pt — closest found shown":"no whole-share trade gets closer to target — see fractional"):null),on&&off.length?html("div",{className:line,title:"outside ±"+band+" pt of target now (percentage points over / under)"},off.map((b,i)=>html("span",{key:b.key},i?" · ":"",b.key+" ",html("span",{style:{color:b.state==="over"?C.orange:C.ink}},fmtPts(b.driftPct))))):null,order.length?html("div",{className:line,title:"where new money helps most: furthest below target first (in dollars)"},"new money → "+order[0].key+" first"+(order.length>1?", then "+order[1].key:"")):null,ns&&isFin(ns.amount)&&ns.amount>0.005?html("div",{className:line,title:"buys, no sales:\n"+buyList(nsBuys)},"or add "+money(ns.amount)+" without selling"):ns&&nsBuys.length?html("div",{className:line,title:"buys from your cash, no sales:\n"+buyList(nsBuys)},"your cash covers it without selling"):null);};// ------------------------------------------------------------------ price alerts · headlines (12.9)
// every read is guarded: data.json from before 12.9 has no priceAlerts / news
const alertRulesOf=d=>{const pa=d&&d.priceAlerts;return pa&&Array.isArray(pa.rules)?pa.rules.filter(r=>r&&typeof r.id==="string"&&typeof r.ticker==="string"):[];};const rulesFor=(d,tk)=>alertRulesOf(d).filter(r=>r.ticker===tk);// a level below 0.1 keeps its digits (0.0065, 0.0000004), else 2 decimals
const fmtLevel=v=>!isFin(v)?"—":v&&Math.abs(v)<0.1?v.toFixed(Math.min(12,2-Math.floor(Math.log10(Math.abs(v))))).replace(/0+$/,""):num(v,Math.round(v)===v?0:2);const signedPctText=v=>isFin(v)?(v<0?"−":"+")+String(Math.abs(v))+"%":"—";const ruleLabel=r=>{switch(r.kind){case"above":return r.ticker+" above "+fmtLevel(r.level);case"below":return r.ticker+" below "+fmtLevel(r.level);case"pctFromCost":return r.ticker+" "+signedPctText(r.level)+" from cost";case"drawdownPct":return"portfolio drawdown ≥ "+(isFin(r.level)?Math.abs(r.level):"—")+"%";default:return r.ticker+" "+String(r.kind||"?");}};const ALERT_REASON={noPrice:"no price for it yet",stale:"the last price fetch failed",notHeld:"you don't hold it",young:"the portfolio history is too short yet",undated:"needs purchase dates",cost:"needs a purchase price for every lot",sales:"needs prices for recorded sales",loading:"waiting for the price history",none:"no portfolio history",noHistory:"no portfolio history yet"};const STATUS_TIP={armed:"waiting for the price to cross",fired:"crossed and notified — re-arms when it crosses back","new":"just added — checked at the next refresh"};const statusColor=st=>st==="fired"?C.amber:st==="armed"?C.ink:C.dim;const statusTip=r=>(r.status==="waiting"?"not checked: "+(ALERT_REASON[r.reason]||r.reason||"waiting"):STATUS_TIP[r.status]||"")+(isFin(r.firedAt)?"\nlast fired "+fmtDay(r.firedAt)+" "+fmtTime(r.firedAt):"");const ruleLine=r=>ruleLabel(r)+" · "+(r.status||"new");const agoText=t=>{if(!isFin(t))return"";const s=Math.max(0,Math.round(Date.now()/1000-t));return s<3600?Math.max(1,Math.round(s/60))+"m ago":s<172800?Math.round(s/3600)+"h ago":Math.round(s/86400)+"d ago";};const newsItemsOf=(d,tk)=>{const n=d&&d.news;const list=n&&n.on===true&&n.items&&typeof n.items==="object"?n.items[tk]:null;return Array.isArray(list)?list.filter(it=>it&&typeof it.title==="string"&&it.title):[];};// the news dot keeps 12.9's meaning: a holding moving more than news.movePct
// today (a news panel, 12.12, also brings headlines for calmer movers)
const NEWS_MOVE_PCT=3;const dayMoves=typeof WeakMap==="function"?new WeakMap():null;const dayMoveOf=(d,tk)=>{let m=dayMoves?dayMoves.get(d):null;if(!m){m={};(Array.isArray(d.positions)?d.positions:[]).forEach(p=>{if(p&&typeof p.ticker==="string"&&isFin(p.dayChangePct))m[p.ticker]=p.dayChangePct;});if(dayMoves)dayMoves.set(d,m);}return m[tk];};const markNewsOf=(d,tk,move)=>{const items=newsItemsOf(d,tk);if(!items.length)return items;const mv=isFin(move)?move:dayMoveOf(d,tk);const lim=isFin(d.news.movePct)?d.news.movePct:NEWS_MOVE_PCT;return isFin(mv)&&Math.abs(mv)>lim?items:[];};// the news panel's rows: the stock open in this window first, then news.top
// (or, from a tracker without it, the tickers with headlines by |day %|);
// up to NEWS_KEEP headlines each
const NEWS_KEEP=3;const newsFeedOf=(d,state)=>{const out=[],seen={},since=Date.now()/1000-NEWS_STALE_S;const add=(tk,items)=>{if(seen[tk])return;seen[tk]=true;// a thinly covered stock's newest Yahoo item can be months old: not shown here (13.3)
items.filter(it=>it&&typeof it.title==="string"&&it.title&&(!isFin(it.time)||it.time>=since)).slice(0,NEWS_KEEP).forEach(it=>out.push({tk:tk,it:it}));};const tk=state.focusTicker;const nw=tk?newsOf(state,tk):null;const own=nw&&Array.isArray(nw.items)?nw.items:[];if(tk&&(own.length||newsItemsOf(d,tk).length))add(tk,own.length?own:newsItemsOf(d,tk));const n=d&&d.news&&d.news.on===true&&d.news.items&&typeof d.news.items==="object"?d.news:null;if(n){const mv=t=>{const v=dayMoveOf(d,t);return isFin(v)?Math.abs(v):-1;};const top=Array.isArray(n.top)?n.top.filter(t=>typeof t==="string"):Object.keys(n.items).sort((a,b)=>mv(b)-mv(a)||(a<b?-1:a>b?1:0));top.forEach(t=>add(t,newsItemsOf(d,t)));}return{rows:out,busy:!!(nw&&nw.busy)};};// ---- the news page (13.1): a window whose `news` options are set (newsCfgOf).
// The keyword in force: the one typed in the panel while cfg.q is still what
// it was typed over, else cfg.q (the editor or the file changed it).
const newsQueryOf=(state,cfg)=>typeof state.newsQuery==="string"&&state.newsQFrom===cfg.q?state.newsQuery:cfg.q;// today's move of a held OR watched ticker
const newsMoveOf=(d,tk)=>{const v=dayMoveOf(d,tk);if(isFin(v))return v;const w=(Array.isArray(d.watchlist)?d.watchlist:[]).find(x=>x&&x.ticker===tk);return w&&isFin(w.dayChangePct)?w.dayChangePct:undefined;};const heldTickers=d=>(Array.isArray(d.positions)?d.positions:[]).filter(p=>p&&typeof p.ticker==="string"&&p.watch!==true&&(isFin(p.shares)?p.shares>0:isFin(p.qty)&&p.qty>0)).map(p=>p.ticker);const watchTickers=d=>(Array.isArray(d.watchlist)?d.watchlist:[]).filter(w=>w&&typeof w.ticker==="string").map(w=>w.ticker);const NEWS_SPAN_DAYS={day:1,"3d":3,week:7};const NEWS_SPAN_TEXT={day:"today","3d":"in the last 3 days",week:"this week"};const NEWS_SPAN_CHIP={day:"last day","3d":"3 days",week:"week"};const NEWS_SPAN_TIP={day:"today","3d":"last 3 days",week:"last week",all:"any time"};const NEWS_SCOPE_TEXT={movers:"today's movers",holdings:"every holding",watch:"watchlist",all:"holdings + watchlist"};const NEWS_SORT_TIP={new:"newest first",move:"biggest movers first",ticker:"A–Z"};// the dedupe key: the url without its utm_* parameters, else the title
const newsKey=it=>{if(typeof it.url==="string"&&it.url){const q=it.url.indexOf("?");if(q<0)return"u:"+it.url;const rest=it.url.slice(q+1).split("&").filter(p=>p.slice(0,4).toLowerCase()!=="utm_");return"u:"+it.url.slice(0,q)+(rest.length?"?"+rest.join("&"):"");}return"t:"+String(it.title).trim().toLowerCase();};const az=(a,b)=>a<b?-1:a>b?1:0;const newsT=r=>isFin(r.time)?r.time:-1e15;const timeDesc=(a,b)=>newsT(b)-newsT(a);// scope → mute → span → keyword → cfg.per per ticker → dedupe → sort → group
const newsPageFeed=(d,state,cfg)=>{const n=d&&d.news&&d.news.on===true&&d.news.items&&typeof d.news.items==="object"?d.news:null;const top=n&&Array.isArray(n.top)?n.top.filter(t=>typeof t==="string"):[];const focus=typeof state.focusTicker==="string"&&state.focusTicker?state.focusTicker:null;let scope,scopeEmpty=false;if(cfg.scope==="holdings")scope=heldTickers(d);else if(cfg.scope==="watch"){scope=watchTickers(d);scopeEmpty=!scope.length;}else if(cfg.scope==="all")scope=heldTickers(d).concat(watchTickers(d));else if(cfg.scope==="pick"){scope=cfg.tickers.slice();scopeEmpty=!scope.length;}else{scope=top.slice();scopeEmpty=!top.length;if(focus&&scope.indexOf(focus)<0)scope.unshift(focus);}const seenTk={};scope=scope.filter(t=>!seenTk[t]&&(seenTk[t]=true));const muted={};cfg.mute.forEach(t=>{muted[t]=true;});const live=scope.filter(t=>!muted[t]);const q=newsQueryOf(state,cfg).toLowerCase();const now=Date.now()/1000,spanS=NEWS_SPAN_DAYS[cfg.span]?NEWS_SPAN_DAYS[cfg.span]*86400:0;const nw=focus&&cfg.scope==="movers"?newsOf(state,focus):null;const own=nw&&Array.isArray(nw.items)?nw.items.filter(it=>it&&typeof it.title==="string"&&it.title):[];let nItems=0,nSpan=0,nQ=0;const byKey={},rows=[];live.forEach(tk=>{let list=tk===focus&&own.length?own:newsItemsOf(d,tk);nItems+=list.length;if(spanS)list=list.filter(it=>isFin(it.time)&&now-it.time<=spanS);nSpan+=list.length;if(q)list=list.filter(it=>it.title.toLowerCase().indexOf(q)>=0||typeof it.source==="string"&&it.source.toLowerCase().indexOf(q)>=0||tk.toLowerCase().indexOf(q)>=0);nQ+=list.length;list.slice(0,cfg.per).forEach(it=>{const k=newsKey(it);let r=byKey[k];if(!r){r=byKey[k]={title:it.title,source:typeof it.source==="string"?it.source:"",time:isFin(it.time)?it.time:null,url:typeof it.url==="string"?it.url:"",tickers:[],move:null};rows.push(r);}if(r.tickers.indexOf(tk)<0)r.tickers.push(tk);});});// market feeds (13.3): rows tagged "@id"; muted / narrowed like a ticker
const feedsOn=cfg.market.filter(f=>NEWS_FEEDS[f]&&!muted["@"+f]);feedsOn.forEach(f=>{const key="@"+f;let list=newsItemsOf(d,key);nItems+=list.length;if(spanS)list=list.filter(it=>isFin(it.time)&&now-it.time<=spanS);nSpan+=list.length;if(q)list=list.filter(it=>it.title.toLowerCase().indexOf(q)>=0||NEWS_FEEDS[f].toLowerCase().indexOf(q)>=0);nQ+=list.length;list.slice(0,cfg.per).forEach(it=>{const k=newsKey(it);let r=byKey[k];if(!r){r=byKey[k]={title:it.title,source:typeof it.source==="string"?it.source:"",time:isFin(it.time)?it.time:null,url:typeof it.url==="string"?it.url:"",tickers:[],move:null};rows.push(r);}if(r.tickers.indexOf(key)<0)r.tickers.push(key);});});const liveAll=live.concat(feedsOn.map(f=>"@"+f));rows.forEach(r=>{r.tickers.sort((a,b)=>(isFeedKey(a)?1:0)-(isFeedKey(b)?1:0)||az(a,b));r.move=r.tickers.reduce((m,t)=>{const v=newsMoveOf(d,t);return isFin(v)&&(m===null||Math.abs(v)>Math.abs(m))?v:m;},null);});const focusFirst=(a,b)=>focus?(b.tickers.indexOf(focus)>=0?1:0)-(a.tickers.indexOf(focus)>=0?1:0):0;const moveDesc=(a,b)=>(a.move===null?1:0)-(b.move===null?1:0)||(a.move===null?0:Math.abs(b.move)-Math.abs(a.move));if(cfg.sort==="new")rows.sort((a,b)=>timeDesc(a,b)||az(a.tickers[0],b.tickers[0])||az(a.title,b.title));else if(cfg.sort==="ticker")rows.sort((a,b)=>az(a.tickers[0],b.tickers[0])||timeDesc(a,b));else rows.sort((a,b)=>focusFirst(a,b)||moveDesc(a,b)||az(a.tickers[0],b.tickers[0])||timeDesc(a,b));let entries;if(cfg.group){const order=[],grp={};rows.forEach(r=>r.tickers.forEach(t=>{if(!grp[t]){grp[t]=[];order.push(t);}grp[t].push(r);}));entries=[];order.forEach(t=>{const g=grp[t].slice().sort(timeDesc);entries.push({kind:"head",tk:t,move:newsMoveOf(d,t),n:g.length});g.forEach(r=>entries.push({kind:"story",row:r,tags:r.tickers.filter(x=>x!==t)}));});}else entries=rows.map(r=>({kind:"story",row:r,tags:r.tickers}));const inScope=list=>n&&isFin(n.keep)&&Array.isArray(list)?list.filter(t=>typeof t==="string"&&liveAll.indexOf(t)>=0).sort(az):[];const tks={};rows.forEach(r=>r.tickers.forEach(t=>{tks[t]=true;}));return{rows:rows,entries:entries,pending:inScope(n&&n.pending),failed:inScope(n&&n.failed),counts:{stories:rows.length,tickers:Object.keys(tks).length},updated:n&&isFin(n.fetchedAt)?n.fetchedAt:null,capped:!!(n&&isFin(n.keep)&&n.keep<cfg.per),scopeEmpty:scopeEmpty&&!feedsOn.length,allMuted:scope.length>0&&!live.length&&!feedsOn.length,planned:liveAll.length,spanHid:nItems>0&&nSpan===0,qHid:nSpan>0&&nQ===0,busy:!!(nw&&nw.busy)};};// pages of `per` entries; a heading that would fill a page's last slot moves on with its stories
const pageEntries=(entries,per)=>{const pages=[];let cur=[];entries.forEach(e=>{if(cur.length>=per||e.kind==="head"&&per>1&&cur.length===per-1){pages.push(cur);cur=[];}cur.push(e);});if(cur.length||!pages.length)pages.push(cur);return pages;};const newsRowCss=(0,_uebersicht.css)(_templateObject109(),C.dim,C.ink);const newsTagCss=(0,_uebersicht.css)(_templateObject110(),C.ink);const newsChipCss=(0,_uebersicht.css)(_templateObject111(),C.dim,C.ink);// bell after a ticker that has price alerts (amber once one has fired)
const Bell=({rules})=>!rules||!rules.length?null:html("span",{title:"price alerts:\n"+rules.map(ruleLine).join("\n"),style:{color:rules.some(r=>r.status==="fired")?C.amber:C.dim,fontSize:8,marginLeft:2}},"\u237E");// 13.6: ✎ after the bell when a stock has a note or a price target (amber once reached)
const NoteMark=({e,p})=>{if(!e)return null;const g=targetGap(e,p);return html("span",{"data-pw-note-mark":"1",title:noteTip(e,p),style:{color:g&&g.reached?C.amber:C.dim,fontSize:8,marginLeft:2}},"\u270E");};// a ticker cell with a bell / news dot: the markers keep their room and a
// long ticker gives way (ends in …); without them the cell is as in 12.8
// (whether a row has them: marksOf in renderWin, as row.bell / row.news allow)
const withMarks=(on,style)=>on?Object.assign({},style,{display:"flex",alignItems:"baseline"}):style;const TICKER_SHRINK={minWidth:0,flex:"0 1 auto",overflow:"hidden",textOverflow:"ellipsis"};// amber dot on a big mover that has headlines; hover = the newest one
const NewsMark=({items})=>!items||!items.length?null:html("span",{title:items[0].title+(items[0].source?"\n"+items[0].source:"")+(isFin(items[0].time)?" · "+agoText(items[0].time):""),style:{color:C.amber,fontSize:9,marginLeft:2}},"\u2022");const xBtn=(0,_uebersicht.css)(_templateObject112(),C.dim,C.ink);const RuleRow=({r,dispatch,busy,long})=>html("div",{className:rowFlex,style:{marginTop:2}},html("span",{className:mono,style:{fontSize:9,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",minWidth:0},title:r.id},ruleLabel(r)),html("span",{className:mono,style:{fontSize:9,whiteSpace:"nowrap"}},html("span",{style:{color:statusColor(r.status)},title:statusTip(r)},r.status||"new"),!long&&r.status==="armed"&&isFin(r.distancePct)?html("span",{style:{color:C.dim}}," · "+Math.abs(r.distancePct).toFixed(1)+"% away"):null,html("span",{className:xBtn,title:busy?"working…":"remove this alert",onClick:()=>{if(!busy)removeAlert(r.id,dispatch);}},"\xD7")));// detail view: the "alert at…" box, this stock's rules, and (opt-in) headlines
// (alerts / news false: that part is switched off in this window, 12.12)
// 13.6: the note / price target rows of a detail view (only with data.json
// "notes"). One "note" row offers both until a stock has either; then a
// "price target" row and a "note" row. The box saves on Return / save only.
const NOTE_TIP="a line for yourself — why you bought it, what to watch";const targetTipOf=p=>"a price you are waiting for, in "+(p.currency||"its currency")+" — the widget shows how far away it is";// the open box: Return or "save" saves, Esc or "cancel" closes, leaving it does nothing
const NoteBox=({p,e,state,dispatch})=>{const field=state.noteEdit==="target"?"target":"note",tk=p.ticker,busy=!!state.noteBusy;const stored=!!(e&&(field==="note"?e.note!==null:e.target!==null));return html("div",{className:rowFlex,style:{marginTop:4}},html("input",{className:inputCss,style:{flex:1,minWidth:0},"data-pw-note-input":field,autoFocus:true,value:state.noteInput||"",maxLength:field==="note"?200:40,placeholder:field==="note"?"a line for yourself (up to 200 characters)":"a price you are waiting for, like 72 ("+(p.currency||"its currency")+")",onChange:ev=>dispatch({type:"NOTE_INPUT",value:ev.target.value}),onKeyDown:ev=>{if(isEnter(ev))submitNote(state,p,dispatch);else if(isEscape(ev))dispatch({type:"NOTE_CANCEL"});}}),html("span",{className:tabBtn,style:{opacity:busy?0.5:1},"data-pw-note-save":"1",onClick:()=>submitNote(state,p,dispatch)},"save"),stored?html("span",{className:tabBtn,style:{opacity:busy?0.5:1},"data-pw-note-clear":"1",title:field==="note"?"remove the note":"remove the price target",onClick:()=>{if(!busy)metaCall(field==="note"?["note",tk,""]:["target",tk,"clear"],tk,dispatch);}},"clear"):null,html("span",{className:tabBtn,"data-pw-note-cancel":"1",onClick:()=>dispatch({type:"NOTE_CANCEL"})},"cancel"));};const NoteRows=({p,d,state,dispatch,alertsOn,narrow})=>{const tk=p.ticker;const e=noteOf(state,d,tk);const edit=state.noteEdit||null;const open=(field,value)=>dispatch({type:"NOTE_EDIT",field:field,value:value});const tTip=targetTipOf(p);const g=e?targetGap(e,p):null;const tFull=e&&e.target!==null?num(e.target,2)+" "+(p.currency||"")+(g?" · "+gapText(g):""):"";const showAlert=!!(e&&e.target!==null&&alertsOn&&!narrow&&isFin(p.price)&&!(g&&g.reached)&&!rulesFor(d,tk).some(r=>(r.kind==="above"||r.kind==="below")&&r.level===e.target));const row=(key,label,right)=>html("div",{key:key,className:(0,_uebersicht.css)(_templateObject113(),statRow,mono),"data-pw-note-row":key},html("span",{style:{color:C.dim,whiteSpace:"nowrap"}},label),html("span",{style:{display:"flex",alignItems:"baseline",minWidth:0,marginLeft:8,whiteSpace:"nowrap"}},right));const btn=(field,text,value,ml)=>html("span",{key:"b"+field+text,className:linkBtn,style:ml?{marginLeft:8}:null,"data-pw-note-edit":field,title:field==="note"?NOTE_TIP:tFull?tFull+"\nclick to change":tTip,onClick:()=>open(field,value)},text);const tRight=!e||e.target===null?[btn("target","set one","",false)]:[html("span",{key:"gap",title:tFull,style:{minWidth:0,overflow:"hidden",textOverflow:"ellipsis"}},narrow&&g?null:num(e.target,2)+" "+(p.currency||"")+(g?" · ":""),g?html("span",{style:{color:g.reached?C.amber:C.dim}},gapText(g)):null),btn("target","change",String(e.target),true),showAlert?html("span",{key:"alert",className:linkBtn,style:{marginLeft:8},"data-pw-note-alert":"1",title:"a Mac notification once the price gets there",onClick:()=>alertCall(["add",tk,e.side||(e.target>p.price?"above":"below"),String(e.target)],dispatch,false)},"alert me"):null];const nRight=!e||e.note===null?[btn("note","add one","",false)]:[html("span",{key:"text","data-pw-note-edit":"note",style:{minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",cursor:"pointer"},title:e.note+(e.at?"\nwritten "+fmtIsoY(e.at):"")+"\nclick to change",onClick:()=>open("note",e.note)},e.note)];const box=edit?html(NoteBox,{key:"box",p:p,e:e,state:state,dispatch:dispatch}):null;const msg=state.noteMsg?html("div",{key:"msg","data-pw-note-msg":"1",className:(0,_uebersicht.css)(_templateObject114(),mono,/^error/.test(state.noteMsg)?C.down:C.amber)},state.noteMsg):null;const rows=!e?[row("empty","note",[btn("note","add a note","",false),btn("target","set a price target","",true)]),box]:[row("target","price target",tRight),edit==="target"?box:null,row("note","note",nRight),edit==="target"?null:box];return html("div",null,rows,msg);};const DetailExtras=({p,d,state,dispatch,alerts,news})=>{const held=p.shares!==undefined&&p.shares!==null;// no purchase price or date: the cost is today's price, a % from it stays 0
const pctOk=held&&p.costUnknown!==true;const rules=rulesFor(d,p.ticker);const on=newsOn(state);const nw=newsOf(state,p.ticker);const items=nw?(nw.items||[]).filter(it=>it&&typeof it.title==="string"&&it.title).slice(0,3):[];return html("div",{style:{marginTop:8}},alerts===false?null:[// (a list, not a wrapper: the 12.11 tree stays as it was)
html("div",{key:"box",className:rowFlex},html("input",{className:inputCss,style:{flex:1,minWidth:0},value:state.alertInput,placeholder:"alert at… 400"+(pctOk?" or -20%":"")+(p.currency?" ("+p.currency+")":""),title:"a price: notified once when it crosses (above or below today's "+num(p.price,2)+")"+(pctOk?"\n-20% = when your P&L on it reaches −20% from your average cost":""),onChange:ev=>dispatch({type:"SET_ALERT_INPUT",value:ev.target.value}),onKeyDown:ev=>{if(isEnter(ev))submitAlert(state,p,held,dispatch);}}),html("span",{className:tabBtn,style:{opacity:state.alertBusy?0.5:1},onClick:()=>submitAlert(state,p,held,dispatch)},"set")),state.alertMsg?html("div",{key:"msg",className:(0,_uebersicht.css)(_templateObject115(),mono,/^error/.test(state.alertMsg)?C.down:C.amber)},state.alertMsg):null,rules.map(r=>html(RuleRow,{key:r.id,r:r,dispatch:dispatch,busy:state.alertBusy,long:false}))],news===false?null:html("div",{style:{marginTop:alerts===false?0:6}},!on?html("div",{className:(0,_uebersicht.css)(_templateObject116(),mono,C.dim)},"headlines off \xB7 ",html("span",{className:linkBtn,style:{fontSize:8.5},title:"show the latest headlines for the stock you open and for big movers (_settings.news)",onClick:()=>{savePref("news",true,dispatch).then(()=>loadNews(p.ticker,dispatch));}},"turn on")):nw&&nw.busy?html("div",{className:(0,_uebersicht.css)(_templateObject117(),mono,C.dim)},"loading headlines\u2026"):items.length?items.map((it,i)=>{const cmd=openCmd(it.url);return html("div",{key:i,style:{marginTop:i?3:0,lineHeight:1.25}},html("div",{style:{fontSize:9.5,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",cursor:cmd?"pointer":"default",color:C.ink},title:it.title+(cmd?"\nclick to open "+it.url:""),onClick:()=>{if(cmd)(0,_uebersicht.run)(cmd).catch(()=>{});}},it.title),html("div",{className:(0,_uebersicht.css)(_templateObject118(),mono,C.dim)},[typeof it.source==="string"?it.source:null,agoText(it.time)||null].filter(x=>x).join(" · ")));}):nw?html("div",{className:(0,_uebersicht.css)(_templateObject119(),mono,C.dim)},nw.error||"no headlines right now"):null));};// right column: every price alert, with remove buttons
const ALERT_ROWS=5;const PriceAlertsPanel=({d,state,dispatch,first,pw})=>{const rules=alertRulesOf(d);const invalid=d&&d.priceAlerts&&isFin(d.priceAlerts.invalid)?d.priceAlerts.invalid:0;if(!rules.length&&!invalid)return null;const shown=state.alertsExpanded?rules:rules.slice(0,ALERT_ROWS);return html("div",_extends({className:first?"":sectionGap},pw||{}),html("div",{className:rowFlex},html("span",{className:eyebrow,title:"_alerts in positions.json \u2014 add one in a stock's detail view"},"price alerts ",rules.length),invalid>0?html("span",{className:(0,_uebersicht.css)(_templateObject120(),mono,C.dim),title:"entries in _alerts that were skipped (bad ticker, kind or value)"},invalid," invalid in positions.json"):null),state.alertMsg&&!state.focusTicker?html("div",{className:(0,_uebersicht.css)(_templateObject121(),mono,/^error/.test(state.alertMsg)?C.down:C.amber)},state.alertMsg):null,shown.map(r=>html(RuleRow,{key:r.id,r:r,dispatch:dispatch,busy:state.alertBusy,long:true})),rules.length>ALERT_ROWS?html("div",{style:{marginTop:3}},html("span",{className:linkBtn,style:{fontSize:8},onClick:()=>dispatch({type:"TOGGLE_ALERTS_EXPANDED"})},state.alertsExpanded?"fewer":"all "+rules.length)):null);};// one line of "alerts · last 7 days": a price alert (kind, 12.9) or a big daily move
const AlertLogText=({a})=>{const val=isFin(a.value)?num(a.value,2):null;switch(a.kind){case"above":case"below":return html("span",null,a.ticker," ",html("span",{style:{color:a.kind==="above"?C.up:C.down}},(a.kind==="above"?"↑":"↓")+fmtLevel(a.level)),val?html("span",{style:{color:C.dim}}," (",val,")"):null);case"pctFromCost":return html("span",{title:isFin(a.pct)?signedPctText(a.pct)+" vs your average cost":undefined},a.ticker," ",html("span",{style:{color:upDown(a.level||0)}},signedPctText(a.level))," from cost");case"drawdownPct":return html("span",{title:isFin(a.pct)?"down "+Math.abs(a.pct)+"% from the peak":undefined},"portfolio drawdown ",html("span",{style:{color:C.down}},(isFin(a.level)?Math.abs(a.level):"—")+"%"));default:return html("span",null,a.ticker," ",String(a.kind));}};// ------------------------------------------------------------------ sections
const SectionToday=({d})=>html("div",null,html("div",{className:(0,_uebersicht.css)(_templateObject122())},[d.movers&&d.movers.up,d.movers&&d.movers.down].map((list,col)=>html("div",{key:col,className:(0,_uebersicht.css)(_templateObject123())},(list||[]).map(m=>html("div",{key:m.ticker,className:rowFlex,style:{marginBottom:2}},html("span",{className:mono,style:{fontSize:10}},m.ticker,html(NewsMark,{items:markNewsOf(d,m.ticker,m.dayChangePct)})),html("span",{className:mono,style:{fontSize:10,color:upDown(m.dayChangeValue)}},signedMoney(m.dayChangeValue)," ",html("span",{style:{color:C.dim}},pct(m.dayChangePct)))))))),html("div",{className:(0,_uebersicht.css)(_templateObject124()),title:"your five biggest holdings as a share of the total"},(d.concentration?d.concentration.top:[]).map((c,i)=>html("div",{key:c.ticker,title:c.ticker+" "+c.weightPct+"%",style:{width:c.weightPct+"%",background:C.ink,opacity:0.85-i*0.14}})),html("div",{style:{flex:1,background:C.faint}})),html("div",{className:(0,_uebersicht.css)(_templateObject125(),mono,C.dim)},(d.concentration?d.concentration.top:[]).map(c=>c.ticker+" "+c.weightPct+"%").join("  "),d.concentration?"  · top 5 = "+d.concentration.topPct+"%":""));const scoreOf=v=>v===null||v===undefined?null:Math.max(1,Math.min(10,Math.ceil(v/10)));const SectionThemes=({d,range,dispatch,w})=>{const sec=d.sectors&&d.sectors[range];const byName={};(sec&&sec.themes||[]).forEach(t=>{byName[t.name]=t.pct;});const tOn=targetsOn(d);return html("div",null,(d.themes||[]).map(t=>{const ser=byName[t.name];const over=ser&&ser.length?ser[ser.length-1]:null;// a sector target (12.10): a tick on the weight bar, target and drift in the title
const tgt=tOn&&typeof t.targetPct==="number"&&isFinite(t.targetPct)?t.targetPct:null;return html("div",{key:t.name,className:rowFlex,style:{marginTop:4,cursor:"pointer"},title:t.name+(over!==null?": "+pct(over)+" over "+range:"")+(tgt!==null?" · target "+fmtTarget(tgt)+" · drift "+fmtPts(t.driftPct)+" pts":"")+" — click to see its graph",onClick:()=>dispatch({type:"SET_SECTOR_FOCUS",name:ser?t.name:byName.Other?"Other":null})},html("span",{style:{fontSize:10,width:78,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}},t.name),w&&w<LAYOUT_K.THEME_MIN?null:html(Spark,{values:ser?ser.filter(v=>v!==null&&v!==undefined):null}),html("div",{className:(0,_uebersicht.css)(_templateObject126()),style:tgt!==null?{position:"relative"}:undefined},html("div",{style:{width:Math.min(100,t.weightPct)+"%",height:"100%",background:C.line,borderRadius:2}}),tgt!==null?html("div",{style:{position:"absolute",left:Math.min(100,tgt)+"%",top:-2,width:1,height:8,marginLeft:-0.5,background:t.driftPct>bandOf(d)?C.orange:C.ink,opacity:0.9}}):null),html("span",{className:mono,style:{fontSize:9,color:C.dim,width:92,textAlign:"right",whiteSpace:"nowrap"}},money(t.value)," ",html("span",{style:{color:upDown(t.dayChangePct||0)}},pct(t.dayChangePct))),html("span",{style:{marginLeft:6}},html(VolBadge,{pct:t.volPct,score:scoreOf(t.volPct)})));}));};// The table twin of the value graph: what the portfolio was worth at the end
// of each day, newest first. Click a row to pin that day on the graph.
const SectionDays=({d,state,dispatch,daily,rows:perPage})=>{const DAY_ROWS=perPage||LAYOUT_K.ROWS.days;// rows per page (layoutFor: 10 with fit-content height)
if(!daily.length){return html("div",{className:(0,_uebersicht.css)(_templateObject127(),C.dim)},"day-by-day values arrive with the next refresh");}const steps=d.basisSteps||[];const baseAt=t=>{let b=0;for(let i=0;i<steps.length&&steps[i][0]<=t;i++)b=steps[i][1];return b;};const rows=daily.slice().reverse();const pages=Math.ceil(rows.length/DAY_ROWS);const page=Math.min(state.dayPage,pages-1);const more=olderAvailable(d,daily);// the full table goes back further
const total=canLoadOlder(d)?Math.max(d.dailyTotal,daily.length):daily.length;const shown=rows.slice(page*DAY_ROWS,(page+1)*DAY_ROWS);const thisYear=String(new Date().getFullYear());const label=iso=>new Date(iso+"T12:00:00").toLocaleDateString(LOCALE,iso.slice(0,4)===thisYear?{weekday:"short",month:"short",day:"numeric"}:{month:"short",day:"numeric",year:"numeric"});return html("div",{style:{marginTop:3}},shown.map((r,i)=>{const prev=rows[page*DAY_ROWS+i+1];let chg=null,chgPct=null;if(prev){// day's gain with new buys taken out
const flow=baseAt(r[1])-baseAt(prev[1]);chg=r[2]-prev[2]-flow;const denom=prev[2]+flow/2;chgPct=denom>0?chg/denom*100:null;}const picked=state.mark&&state.mark.d===r[0];return html("div",{key:r[0],className:rowFlex,title:(r[3]?"≈ from that day's closing prices and the shares you held then":"recorded by the widget at "+fmtTime(r[1]))+" — click to pin it on the graph",onClick:()=>dispatch(picked?{type:"SET_MARK",mark:null}:{type:"PICK_DAY",mark:dayMark(r),range:pickRange(r[1],d)}),style:{marginTop:3,cursor:"pointer",borderRadius:3,padding:"0 2px",background:picked?"rgba(var(--pw-fg),0.08)":"transparent"}},html("span",{className:mono,style:{fontSize:9.5,color:C.dim,width:84,whiteSpace:"nowrap"}},label(r[0])),html("span",{className:mono,style:{fontSize:9.5}},r[3]?html("span",{style:{color:C.dim}},"\u2248 "):null,money(r[2],true)),html("span",{className:mono,style:{fontSize:9,width:104,textAlign:"right",whiteSpace:"nowrap",color:chg===null?C.dim:upDown(chg)}},chg===null?"":pct(chgPct),html("span",{style:{color:C.dim}},chg===null?"":" "+signedMoney(chg))));}),html("div",{className:rowFlex,style:{marginTop:5}},html("span",{className:linkBtn,style:{visibility:page>0?"visible":"hidden"},onClick:()=>dispatch({type:"SET_DAY_PAGE",page:page-1})},"\u2039 newer"),html("span",{className:(0,_uebersicht.css)(_templateObject128(),mono,C.dim)},state.older.msg&&state.older.key===dailyKey(d)?html("span",{style:{color:C.amber}},state.older.msg):total>daily.length?daily.length+" of "+total+" days · or type a date above":daily.length+" days · or type a date above the graph"),html("span",{className:linkBtn,style:{visibility:page<pages-1||more?"visible":"hidden"},title:page<pages-1?"":"load "+OLDER_CHUNK+" older days",onClick:()=>{if(page<pages-1)return dispatch({type:"SET_DAY_PAGE",page:page+1});if(!more||state.older.busy)return null;return loadOlder(d,daily,OLDER_CHUNK,dispatch,all=>{if(all)dispatch({type:"SET_DAY_PAGE",page:page+1});});}},page>=pages-1&&state.older.busy?"loading…":"older ›")));};const SectionRisk=({d})=>{const r=d.risk||{};const diversified=r.volPct&&r.avgHoldingVolPct?Math.round((1-r.volPct/r.avgHoldingVolPct)*100):null;const chips=list=>(list||[]).map(p=>html("span",{key:p.ticker,className:mono,style:{fontSize:9.5,marginRight:8}},p.ticker," ",html(VolBadge,{pct:p.volPct,score:p.volScore})));// 12.8: drawdown · beta · sharpe, real (after 30 days of dated history) and backtest
const perf=d.performance&&typeof d.performance==="object"?d.performance:null;const real=perf&&perf.ok===true&&r.real&&typeof r.real==="object"?r.real:null;const bt=r.backtest&&typeof r.backtest==="object"?r.backtest:null;const why=perfWhy(perf);const rfTxt=f=>(isFin(f.riskFreePct)?f.riskFreePct:4)+"%";const ddOf=f=>f.drawdown&&typeof f.drawdown==="object"?f.drawdown:{};const figTip=f=>"annual return "+pct1(f.annualReturnPct)+" · volatility "+(isFin(f.volPct)?f.volPct+"%/yr":"—")+"\nsharpe = (annual return − "+rfTxt(f)+") ÷ volatility"+"\nbeta = how much it moved per 1% move of "+(f.betaVs||"the index")+" (1 = in step)";const realDd=real?ddOf(real):{};// the lines are nowrap in a ~300 px column: dates that don't fit go to the tooltip
const leftOut=perf&&Array.isArray(perf.twrLeftOut)?perf.twrLeftOut.filter(t=>typeof t==="string"):[];const realNote="\n(holdings only: cash left out"+(leftOut.length?"; without "+leftOut.join(", ")+": sold, no prices":"")+")";const btDd=bt?ddOf(bt):{};const riskLine=(0,_uebersicht.css)(_templateObject129(),mono);return html("div",{style:{marginTop:4}},real?html("div",{className:riskLine,title:"drawdown = how far below its best level the portfolio is (returns time-weighted: new money taken out)"+(realDd.peakDate?"\nnow "+pct1(realDd.currentPct)+" from its peak of "+fmtIsoY(realDd.peakDate):"")+(realDd.maxPeakDate?"\nworst fall: from "+fmtIsoY(realDd.maxPeakDate)+" to "+fmtIsoY(realDd.maxDate)+(realDd.recoveredDate?", back at that level "+fmtIsoY(realDd.recoveredDate):", not recovered yet"):"")+realNote},"drawdown "+(isFin(realDd.currentPct)&&realDd.currentPct>-0.05?"0.0% (at peak)":pct1(realDd.currentPct))+" · max "+pct1(realDd.maxPct)+(realDd.maxDate?" ("+fmtIsoY(realDd.maxDate)+")":"")):null,real?html("div",{className:riskLine,title:figTip(real)+"\nsince "+fmtIsoY(real.start)+", time-weighted daily values"+realNote},"beta "+num2(real.beta)+(real.betaVs?" vs "+real.betaVs:"")+" · sharpe "+num2(real.sharpe)):why?html("div",{className:(0,_uebersicht.css)(_templateObject130(),mono,C.dim),title:"these figures need at least 30 days of dated purchases, with a price for every purchase and sale"},why):null,bt?html("div",{className:(0,_uebersicht.css)(_templateObject131(),riskLine,C.dim),title:"today's holdings (share counts now) priced back, prices only; hindsight flatters this\n"+figTip(bt)+(btDd.maxDate?"\nmax drawdown "+pct1(btDd.maxPct)+", on "+fmtIsoY(btDd.maxDate):"")},String(bt.label||"backtest").replace(", "," ")+": max dd "+pct1(btDd.maxPct)+" · beta "+num2(bt.beta)+" · sharpe "+num2(bt.sharpe)):null,html("div",{className:rowFlex,style:real||why||bt?{marginTop:5}:undefined,title:volTip(r.volPct,r.volScore)+"\n(the portfolio as a whole, holdings as they are now)"},html("span",{style:{fontSize:10}},"portfolio"),html("span",{className:mono,style:{fontSize:10}},r.volScore?html("span",null,html("span",{style:{color:volColor(r.volScore)}},r.volScore,"/10 ",VOL_LABEL[r.volScore])," · "+r.volPct+"%/yr ",html(VolMeter,{score:r.volScore})):"—")),html("div",{className:(0,_uebersicht.css)(_templateObject132(),mono,C.dim),title:"the average holding swings more than the whole portfolio: holdings don't all move together"},"avg holding ",r.avgHoldingVolPct?r.avgHoldingVolPct+"%":"—",diversified!==null&&diversified>0?" · mix swings "+diversified+"% less than its parts":"",r.wildSharePct?" · "+r.wildSharePct+"% in scores 7+":""),html("div",{className:rowFlex,style:{marginTop:6}},html("span",{className:eyebrow},"wildest"),html("span",null,chips(r.mostVolatile))),html("div",{className:rowFlex,style:{marginTop:4}},html("span",{className:eyebrow},"calmest"),html("span",null,chips(r.calmest))),r.unscored&&r.unscored.length?html("div",{className:(0,_uebersicht.css)(_templateObject133(),mono,C.dim)},"no score yet (short history): ",r.unscored.slice(0,5).join(" ")):null);};const LoadingLine=({progress})=>{const done=progress?progress.done:0;const total=progress&&progress.total?progress.total:1;return html("div",{style:{marginTop:6}},html("div",{className:(0,_uebersicht.css)(_templateObject134(),C.faint)},html("div",{style:{width:Math.min(100,done/total*100)+"%",height:"100%",background:C.ink,borderRadius:1,transition:"width 0.4s"}})),html("div",{className:(0,_uebersicht.css)(_templateObject135(),mono,C.dim)},"refreshing ",done,"/",total,progress&&progress.current?" · "+progress.current:""));};const sortRows=(rows,sort)=>{const out=rows.slice();const key={value:p=>-(p.value||0),day:p=>-(p.dayChangePct===null||p.dayChangePct===undefined?-1e9:p.dayChangePct),vol:p=>-(p.volPct===null||p.volPct===undefined?-1:p.volPct)}[sort];if(key)out.sort((a,b)=>key(a)-key(b)||(a.ticker<b.ticker?-1:1));return out;};// ------------------------------------------------------------------ layout (12.12)
// What a window shows at its size is decided by ONE pure function,
// layoutFor(win, ctx, K): no DOM measuring (nothing to jitter), widths from
// the window's width and mono text estimates (SF Mono: 0.62 em a glyph),
// heights from K (LAYOUT_K). ctx (renderWin builds it from the data):
//   Wu, Hu (unscaled px; Hu "auto" = fit content), on {id: enabled and has
//   something to show}, order (panel ids, items order), est {panelId: (colW, R)
//   => px} (R = rows per list + map height), lists {holdings, earnings, days,
//   news: counts or null, map: bool}, head [[{id, w}]] (header lines), tabs
//   [px] (the range tab row), big, sector, facets, focusSector, readoutOwnLine,
//   notesForced, benchLine, lateLine, simCap, benchPick, loading, mapWide,
//   expanded, compact, compactW, cellsOn, tOn, undated.
// Auto height: nothing folds, 12.11's rows and graph. Fixed height: fold
// units (priority room < normal < always, then the later one first) until the
// body fits, shrinking the graph, then rows in the tallest column; then grow
// rows and the graph into what is left. Same inputs, same layout.
const PRIO_RANK={room:0,normal:1,always:2};const HEAD_IDS=["header.value","header.day","header.fx","header.pl","header.div","header.realized","header.totalReturn","header.annual","header.goal"];const GRAPH_PARTS=[["graph.tabs",11],["graph.bench",12],["graph.backtest",13],["graph.late",14],["graph.notes",15]];const LIST_ORDER=[["holdings","panel.holdings"],["earnings","panel.earnings"],["days","panel.days"],["news","panel.news"],["map","panel.holdings"]];const monoW=(chars,px,K)=>chars*(K||LAYOUT_K).MONO*px;const clampN=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));// lines needed for items ws packed into lines w wide (a wider item wraps inside itself)
const packLines=(ws,w)=>{let lines=0,cur=Infinity;ws.forEach(x=>{if(!(x>0))return;if(x>w){lines+=Math.ceil(x/Math.max(1,w));cur=Infinity;}else if(cur+x>w){lines++;cur=x;}else cur+=x;});return lines;};// a side over m columns, in order: the next column once this one holds its
// share of what is left (and every later column still gets one)
const splitSeq=(units,m,estOf,gap)=>{const out=[[]];const hs=units.map(estOf);let rest=hs.reduce((a,b)=>a+b,0),cur=0;units.forEach((u,i)=>{const col=out[out.length-1],left=m-out.length+1;if(col.length&&left>1&&(cur>=(rest+cur)/left||units.length-i<=left-1)){out.push([u]);cur=hs[i];}else{cur+=(col.length?gap:0)+hs[i];col.push(u);}rest-=hs[i];});return out;};// holding-row cells that fit width w (ticker and day % always stay)
const rowCells=(w,on,tOn,undated,K)=>{const C0=K.CELL;const has={spark:!!on.spark,vol:!!on.vol,drift:!!on.drift&&!!tOn,day:on.day!==false,value:!!on.value,pl:!!on.pl,price:!!on.price};let spark=has.drift?C0.spark-C0.drift:C0.spark;const sum=()=>{const ks=Object.keys(has).filter(k=>has[k]);return C0.ticker+ks.reduce((s,k)=>s+(k==="spark"?spark:C0[k]),0)+(undated?ks.length*K.UNDATED_GAP:0);};for(let i=0;i<K.CELL_DROP.length&&sum()>Math.floor(w);i++){const step=K.CELL_DROP[i];if(step==="spark30")spark=Math.min(spark,K.SPARK_MID);else has[step]=false;}return{cells:has,sparkW:spark};};const watchCells=(w,on,K)=>{const C0=K.WATCH;const has={spark:!!on.spark,vol:!!on.vol};let spark=C0.spark;const sum=()=>C0.ticker+C0.name+C0.day+C0.price+C0.x+(has.spark?spark:0)+(has.vol?C0.vol:0);for(let i=0;i<K.WATCH_DROP.length&&sum()>Math.floor(w);i++){const step=K.WATCH_DROP[i];if(step==="spark30")spark=Math.min(spark,K.SPARK_MID);else has[step]=false;}return{cells:has,sparkW:spark};};const layoutFor=(win,ctx,K0)=>{const K=K0||LAYOUT_K;const w0=win||{};const Wu=ctx.Wu,CW=Wu-K.PAD_X;const auto=!isNumber(ctx.Hu);const avail=auto?Infinity:ctx.Hu-K.CHROME;const on=ctx.on||{};const prioOf=id=>{const p=w0.prio&&w0.prio[id];return PRIO_RANK[p]!==undefined?p:FEATURE_BY[id]&&FEATURE_BY[id].p||"normal";};const sideOf=id=>{const s=w0.side&&w0.side[id];return s==="a"||s==="b"?s:FEATURE_BY[id]&&FEATURE_BY[id].side||"b";};const L={K:K,Wu:Wu,CW:CW,auto:auto,avail:avail,base:CW===K.BASE_CW,show:{},folded:[],hint:false,scroll:false,est:{},head:[],cols:[],colW:[],flex:[]};Object.keys(on).forEach(id=>{if(on[id])L.show[id]=true;});// ---- widths
const graphW=CW-2;const g=clampN(graphW/K.BASE_GRAPH_W,K.G_MIN,K.G_MAX);const graphT=Math.round((ctx.big?K.GRAPH_H_BIG:K.GRAPH_H)*g);L.graphW=graphW;L.graphT=graphT;L.sectorCols=clampN(Math.floor((graphW+K.SECTOR_GAP)/K.SECTOR_FACET),1,K.SECTOR_MAXCOLS);L.captionW=graphW-K.CAPTION_OFF;L.mapBigW=CW+2;const tabsW=(ctx.tabs||[]).reduce((a,b)=>a+b,0);L.tabWrap=tabsW+Math.max(K.TAB_BIG,ctx.tabsReadout||0)>CW;// (13.6: ctx.tabsReadout — a narrow window's change figure rides on the tabs line)
L.tabLines=!tabsW?1:!L.tabWrap?1:ctx.tabsReadout?packLines(ctx.tabs.concat([ctx.tabsReadout]),CW):packLines(ctx.tabs,CW-K.TAB_RESERVE);if(ctx.compact){// the one-line row: the sparkline gives way first, then the money figure
const cw=ctx.compactW||0;L.compact=true;L.compactSpark=cw+K.COMPACT_SPARK+8<=CW?K.COMPACT_SPARK:cw+K.SPARK_MID+8<=CW?CW-cw-8:0;L.compactMoney=cw<=CW;return L;}// ---- header lines (line 1: value + day; then prices/P&L, realized/total, annual)
const headH=(show,rec)=>{let h=0;(ctx.head||[]).forEach((ln,i)=>{const ws=ln.filter(it=>show[it.id]).map(it=>it.w);if(!ws.length){if(rec)L.head[i]=0;return;}const n=Math.max(1,packLines(ws,CW));if(rec)L.head[i]=n;h+=i===0?K.HDR1+(n-1)*(K.HDR1-3):K.HDRN*n;});return h;};// ---- the graph block (or the mini graph that stays when it folds)
const sectorGridH=ctx.facets>0?Math.ceil(ctx.facets/L.sectorCols)*K.SECTOR_ROW+(Math.ceil(ctx.facets/L.sectorCols)-1)*K.SECTOR_ROWGAP:null;const graphShrinks=!ctx.sector||!!ctx.focusSector||sectorGridH===null;const graphBlockH=(show,gH)=>{if(!show.graph)return show["graph.mini"]?K.MINI:0;let h=K.GRAPH_MT;if(show["graph.tabs"])h+=K.TABS*L.tabLines+(ctx.readoutOwnLine?K.READOUT:0);if(ctx.sector&&!ctx.focusSector&&sectorGridH!==null)h+=sectorGridH;else h+=gH+(ctx.sector&&!ctx.focusSector?0:K.AXIS)+(ctx.focusSector?15+(ctx.focusList||0):0);if(show["graph.notes"]||ctx.notesForced)h+=K.NOTES;if(show["graph.bench"]&&ctx.benchLine||show["graph.late"]&&ctx.lateLine)h+=K.CAPTION;if(show["graph.backtest"]&&ctx.simCap)h+=K.SIMCAP;if(show["graph.bench"]&&ctx.benchPick)h+=K.BENCH_PICK;return h;};// ---- column units: panels in items order; the rotating carousel is one unit
const rotate=w0.carousel!=="stack";const units=[];let car=null;(ctx.order||[]).forEach((id,i)=>{const f=FEATURE_BY[id];if(!on[id]||!f||f.kind!=="panel")return;const picked=!!(w0.side&&(w0.side[id]==="a"||w0.side[id]==="b"));if(f.car&&rotate){if(!car){car={key:"carousel",ids:[],side:sideOf(id),pos:100+i,p:prioOf(id),free:!picked};units.push(car);}car.ids.push(id);if(picked){car.free=false;car.side=sideOf(id);}if(PRIO_RANK[prioOf(id)]>PRIO_RANK[car.p])car.p=prioOf(id);}else units.push({key:id,ids:[id],side:sideOf(id),pos:100+i,p:prioOf(id),free:!picked&&id!=="panel.holdings"});});const estId=(id,w,R)=>ctx.est&&ctx.est[id]?ctx.est[id](w,R):K.EYEBROW;const uEst=(u,w,R)=>u.ids.reduce((m,id)=>Math.max(m,estId(id,w,R)),0);const R0={holdings:K.ROWS.holdings,earnings:K.ROWS.earnings,days:K.ROWS.days,news:K.ROWS.news,map:K.MAP_H};const assign=us=>{let n=Math.min(CW>=K.COL3?3:CW>=K.COL2?2:1,us.length);if(!n)return{cols:[],colW:[],flex:[],unitW:CW};const uw=m=>(CW-K.GUTTER*(m-1))/m;const est0=m=>u=>uEst(u,uw(m),R0);// auto-balance (13.2): a panel whose column the user never picked goes to
// the column that is shorter so far (its default column on a tie), so the
// left side never runs far below the right; picked columns are kept, and
// the holdings panel anchors the left unless moved
if(n>=2){const e=est0(2),h={a:0,b:0};us.forEach(u=>{if(!u.free)h[u.side]+=e(u)+K.GAP;});// the anchors first (the holdings list)
us.forEach(u=>{if(!u.free)return;u.side=h.a===h.b?u.side:h.a<h.b?"a":"b";h[u.side]+=e(u)+K.GAP;});}const A=us.filter(u=>u.side==="a"),B=us.filter(u=>u.side!=="a");let cols;if(n===1)cols=[A.concat(B)];else if(A.length&&B.length){let aN=1,bN=n-1;while(bN>B.length){bN--;if(aN<A.length)aN++;}n=aN+bN;cols=splitSeq(A,aN,est0(n),K.GAP).concat(splitSeq(B,bN,est0(n),K.GAP));}else cols=splitSeq(A.length?A:B,n,est0(n),K.GAP);n=cols.length;const free=CW-K.GUTTER*(n-1);const flex=cols.map(c=>ctx.mapWide&&c.some(u=>u.ids.indexOf("panel.holdings")>=0)?K.MAP_FLEX:1);const sum=flex.reduce((a,b)=>a+b,0);// (rounded to 1e-6 px: 495 · 1.35 / 1.35 must stay 495, not 494.99999…, before any floor)
return{cols:cols,flex:flex,colW:flex.map(f=>Math.round(free*f/sum*1e6)/1e6),unitW:free/n};};const colH=(lay,i,R)=>lay.cols[i].reduce((s,u,j)=>s+(j?K.GAP:0)+uEst(u,lay.colW[i],R),0);const counts=ctx.lists||{};const active=(x,lay)=>(x==="map"?!!counts.map:isNumber(counts[x]))&&lay.cols.some(c=>c.some(u=>u.ids.indexOf(LIST_ORDER.find(l=>l[0]===x)[1])>=0));const shownRows=(x,R)=>x==="map"?R.map:Math.min(R[x],counts[x]);const total=st=>{let T=0,first=true;const add=h=>{if(h>0){T+=(first?0:K.GAP)+h;first=false;}};add(headH(st.show,false));add(ctx.welcome?K.WELCOME:0);// the welcome card (13.4)
add(graphBlockH(st.show,st.gH));add(st.lay.cols.reduce((m,c,i)=>Math.max(m,colH(st.lay,i,st.R)),0));add((st.show.footer||ctx.warn?K.FOOTER:0)+(ctx.loading?K.LOADING:0));// (its red warnings stay)
return T+(st.hint?K.HINT:0);};// ---- fold units, lowest priority first, later position first
const U=[];HEAD_IDS.forEach((id,i)=>{if(on[id])U.push({ids:[id],p:prioOf(id),pos:i});});if(on.graph){U.push({ids:["graph"],p:prioOf("graph"),pos:10});GRAPH_PARTS.forEach(gp=>{if(on[gp[0]])U.push({ids:[gp[0]],p:prioOf(gp[0]),pos:gp[1]});});U.push({ids:["graph.mini"],p:"always",pos:9.5,mini:true});}units.forEach(u=>U.push({ids:u.ids,p:u.p,pos:u.pos}));if(on.footer)U.push({ids:["footer"],p:prioOf("footer"),pos:999});U.sort((a,b)=>PRIO_RANK[a.p]-PRIO_RANK[b.p]||b.pos-a.pos);const stateFor=k=>{const fold={};U.slice(0,k).forEach(u=>u.ids.forEach(id=>{fold[id]=true;}));const show=Object.assign({},L.show);Object.keys(fold).forEach(id=>{show[id]=false;});if(fold.graph)Object.keys(show).forEach(id=>{if(id.indexOf("graph.")===0)show[id]=false;});show["graph.mini"]=!!on.graph&&!!fold.graph&&!fold["graph.mini"];return{k:k,show:show,lay:assign(units.filter(u=>!fold[u.ids[0]])),hint:U.slice(0,k).some(u=>!u.mini),R:Object.assign({},R0),gH:graphT};};const gMin=Math.max(K.GRAPH_MIN,Math.round(K.GRAPH_MIN_F*graphT));const canShrinkGraph=st=>st.show.graph&&graphShrinks&&st.gH>gMin;// one step: the graph, else one row (or 20 px of map) from a list in the tallest column
const shrinkRow=st=>{const order=st.lay.cols.map((c,i)=>[colH(st.lay,i,st.R),i]).sort((a,b)=>b[0]-a[0]||a[1]-b[1]);for(let o=0;o<order.length;o++){const col=st.lay.cols[order[o][1]];for(let j=0;j<LIST_ORDER.length;j++){const x=LIST_ORDER[j][0];if(!active(x,st.lay)||!col.some(u=>u.ids.indexOf(LIST_ORDER[j][1])>=0))continue;if(x==="map"){if(st.R.map>K.MAP_MIN){st.R.map=Math.max(K.MAP_MIN,st.R.map-K.MAP_STEP);return true;}}else if(shownRows(x,st.R)>K.ROWS_MIN[x]){st.R[x]=shownRows(x,st.R)-1;return true;}}}return false;};const atMin=st=>{const m=Object.assign({},st,{R:Object.assign({},st.R),gH:canShrinkGraph(st)?gMin:st.gH});["holdings","earnings","days","news"].forEach(x=>{if(active(x,m.lay))m.R[x]=Math.min(shownRows(x,m.R),Math.max(K.ROWS_MIN[x],0));});if(active("map",m.lay))m.R.map=K.MAP_MIN;return m;};let st;if(auto){st=stateFor(0);}else if(ctx.expanded){st=stateFor(0);// the map takes the room between the header and the footer
st.lay=assign([]);st.show=Object.assign({},st.show,{graph:false,"graph.mini":false});}else{for(let k=0;k<=U.length&&!st;k++){const s=stateFor(k);if(total(atMin(s))<=avail||k===U.length)st=s;}let guard=0;while(total(st)>avail&&guard++<5000){if(canShrinkGraph(st))st.gH=Math.max(gMin,st.gH-K.GRAPH_STEP);else if(!shrinkRow(st))break;}L.scroll=total(st)>avail;// grow into what is left: rows first, then the graph
["holdings","earnings","days","news"].forEach(x=>{if(!active(x,st.lay))return;const cap=Math.min(counts[x],K.ROWS_MAX[x]);while(shownRows(x,st.R)<cap){const prev=st.R[x];st.R[x]=shownRows(x,st.R)+1;if(total(st)>avail){st.R[x]=prev;break;}}});while(active("map",st.lay)&&st.R.map<K.MAP_H){st.R.map=Math.min(K.MAP_H,st.R.map+K.MAP_STEP);if(total(st)>avail){st.R.map-=K.MAP_STEP;break;}}const gMax=Math.min(Math.round(graphW*K.GRAPH_MAX_F),K.GRAPH_MAX);while(st.show.graph&&graphShrinks&&st.gH+K.GRAPH_STEP<=gMax){st.gH+=K.GRAPH_STEP;if(total(st)>avail){st.gH-=K.GRAPH_STEP;break;}}}// ---- the result
L.show=st.show;L.folded=[];U.slice(0,st.k).forEach(u=>{if(!u.mini)u.ids.forEach(id=>L.folded.push(id));});L.hint=L.folded.length>0;L.graphH=st.gH;L.yTicks=st.gH>=200?8:st.gH>=150?6:4;// rows per page: 12.11's with auto height, else what the height allows (never more than there are)
L.rows={};["holdings","earnings","days","news"].forEach(x=>{L.rows[x]=auto||!isNumber(counts[x])?st.R[x]:Math.max(1,shownRows(x,st.R));});L.mapH=st.R.map;const lay=st.lay;L.cols=lay.cols.map(c=>c.map(u=>({key:u.key,ids:u.ids})));L.colW=lay.colW;L.flex=lay.flex;L.unitW=lay.unitW;L.priceW=Math.floor(lay.unitW);L.focusEyebrowW=Math.floor(lay.unitW)-K.EYEBROW_OFF;const hi=lay.cols.findIndex(c=>c.some(u=>u.ids.indexOf("panel.holdings")>=0));L.holdW=hi>=0?lay.colW[hi]:CW;L.mapW=Math.floor(L.holdW)-K.MAP_INSET;const rc=rowCells(L.holdW,ctx.cellsOn||{},ctx.tOn,ctx.undated,K);L.cells=rc.cells;L.sparkW=rc.sparkW;const wc=watchCells(L.holdW,ctx.cellsOn||{},K);L.watchCells=wc.cells;L.watchSparkW=wc.sparkW;lay.cols.forEach((c,i)=>c.forEach(u=>{L.est[u.key]=Math.round(uEst(u,lay.colW[i],st.R));}));L.est.header=headH(st.show,true);L.est.graph=graphBlockH(st.show,st.gH);L.est.footer=st.show.footer?K.FOOTER:0;L.T=total(st);if(ctx.expanded){const rest=L.T;// header + footer (+ gaps)
L.mapBigH=auto?K.MAP_BIG_H:Math.max(K.MAP_MIN,avail-rest-K.GAP-K.EYEBROW-6);}return L;};// ------------------------------------------------------------------ compact
// One line (12.11): total, today's % and money, a sparkline. The title
// toggles back; the row is still the drag handle, and frame() keeps the
// position and scale. Views left open (map, a stock) come back when expanded.
const COMPACT_SPARK_MAX=80;const compactSpark=d=>{const h=d.history&&Array.isArray(d.history["1D"])?d.history["1D"]:[];const vs=h.map(p=>p&&isFin(p.v)?p.v:null).filter(v=>v!==null);if(vs.length>=2){const step=Math.ceil(vs.length/COMPACT_SPARK_MAX);if(step<=1)return vs;const out=[];for(let i=(vs.length-1)%step;i<vs.length;i+=step)out.push(vs[i]);// keeps the newest
return out;}const rows=Array.isArray(d.daily)?d.daily:[];return rows.slice(-30).map(r=>Array.isArray(r)&&isFin(r[2])?r[2]:null).filter(v=>v!==null);};// a window's own title (_settings.display), else the portfolio's name
// ------------------------------------------------------------------ the ⚙ editor (12.12)
// Opens at the top of a window's body. Every change makes a new display
// (migrating from the legacy keys first) and goes through saveDisplay: the
// screen follows at once, the file once, 300 ms after the last change.
const FEATURE_IDX={};FEATURES.forEach((f,i)=>{FEATURE_IDX[f.id]=i;});const EDIT_FEATURE_GROUPS=[["header","Top numbers"],["graph","Graph"],["panels","Panels"],["holdings","Holdings"],["rows","Each holding's row"],["footer","Small print (bottom row)"]];const editGroupOf=id=>id.indexOf("header.")===0?"header":id==="graph"||id.indexOf("graph.")===0?"graph":id==="panel.holdings"||/^(holdings|map|detail)\./.test(id)?"holdings":id.indexOf("panel.")===0?"panels":id.indexOf("row.")===0?"rows":"footer";const depthOf=id=>{let n=0;for(let f=FEATURE_BY[id];f&&f.parent;f=FEATURE_BY[f.parent])n++;return n;};const winItems=w=>w&&Array.isArray(w.items)?w.items.slice():FULL_ITEMS.slice();// back in at its registry place (before the first item that comes after it),
// so off then on gives the same order
const insertItem=(items,id)=>{const k=FEATURE_IDX[id];const at=items.findIndex(x=>FEATURE_IDX[x]!==undefined&&FEATURE_IDX[x]>k);if(at<0)items.push(id);else items.splice(at,0,id);};// switch one id; switching on something none of whose parts is on also brings
// its parts of the full set (a graph with tabs, holdings with a list…)
const toggleItem=(w,id,on)=>{const items=winItems(w).filter(x=>x!==id);if(!on)return items;insertItem(items,id);const kids=FULL_ITEMS.filter(x=>x!==id&&isUnder(x,id));if(kids.length&&!kids.some(x=>items.indexOf(x)>=0))kids.forEach(x=>insertItem(items,x));return items;};// a map of per-id choices without the entries equal to the registry default
const withChoice=(map,id,v,dflt)=>{const m=Object.assign({},map||{});if(v===dflt)delete m[id];else m[id]=v;return Object.keys(m).length?m:undefined;};const edSideOf=(w,id)=>w.side&&w.side[id]||FEATURE_BY[id]&&FEATURE_BY[id].side||"b";// ↑ / ↓ among the panels of the same side (dir −1 / +1); null = already at that end
const shiftPanel=(w,id,dir)=>{const items=winItems(w);const same=items.filter(x=>FEATURE_BY[x]&&FEATURE_BY[x].kind==="panel"&&edSideOf(w,x)===edSideOf(w,id));const j=same.indexOf(id),other=same[j+dir];if(j<0||!other)return null;const a=items.indexOf(id),b=items.indexOf(other);items[a]=other;items[b]=id;return items;};// "to top" (13.2): the panel goes before every other panel in the order (so
// it is the first in its column); null = already there
const topPanel=(w,id)=>{const items=winItems(w);const first=items.find(x=>FEATURE_BY[x]&&FEATURE_BY[x].kind==="panel");if(!first||first===id)return null;items.splice(items.indexOf(id),1);items.splice(items.indexOf(first),0,id);return items;};// "→ window": the id with its parts that are on goes to the end of the other
// window's items (its priority / side choices go along)
const moveFeature=(disp,fromId,toId,id)=>{const src=disp.windows.find(w=>w.id===fromId),dst=disp.windows.find(w=>w.id===toId);if(!src||!dst)return null;const srcItems=winItems(src);const moving=srcItems.filter(x=>isUnder(x,id));const dstItems=winItems(dst);moving.forEach(x=>{if(dstItems.indexOf(x)<0)dstItems.push(x);});const carry=field=>{const from=Object.assign({},src[field]||{}),to=Object.assign({},dst[field]||{});moving.forEach(x=>{if(from[x]!==undefined){to[x]=from[x];delete from[x];}});return[Object.keys(from).length?from:undefined,Object.keys(to).length?to:undefined];};const pr=carry("prio"),sd=carry("side");return patchWin(patchWin(disp,fromId,{items:srcItems.filter(x=>moving.indexOf(x)<0),prio:pr[0],side:sd[0]}),toId,{items:dstItems,prio:pr[1],side:sd[1]});};const newWinId=disp=>{for(let i=2;;i++)if(!disp.windows.some(w=>w.id==="w"+i))return"w"+i;};const cleanTitle=v=>Array.from(String(v||"").replace(TITLE_BAD_CH,"")).filter(c=>!lone(c)).join("").trim().replace(/^[\s\S]*/,t=>Array.from(t).slice(0,40).join("").trim());// a new window (from a template, or a copy of `src`) beside the others (placeBeside)
const addWindow=(base,src,w,dispatch)=>{if(base.windows.length>=MAX_WINDOWS)return null;const nw=Object.assign({},w,{id:newWinId(base)});delete nw.x;delete nw.y;const zoom=validScale(nw.zoom)||1;const p=placeBeside(base.windows,src,frameWidth(nw.w,zoom,winSize()[0]),nw.h,zoom);nw.x=p.x;nw.y=p.y;saveDisplay({windows:base.windows.concat([nw])},dispatch);dispatch({type:"FRONT",w:nw.id});return nw.id;};const fromTemplate=t=>{const w={title:t.key==="full"?undefined:t.label,w:t.w,h:t.h};if(Array.isArray(t.items))w.items=t.items.slice();if(t.compact)w.compact=true;if(t.newsCfg)w.news=Object.assign({},t.newsCfg);Object.keys(w).forEach(k=>{if(w[k]===undefined)delete w[k];});return w;};// the window's body scrolls to its top, where the editor opens
const bodyToTop=ev=>{try{const root=ev&&ev.currentTarget&&ev.currentTarget.closest?ev.currentTarget.closest("[data-pw-win]"):null;const body=root&&root.firstChild?root.firstChild.lastChild:null;if(body)body.scrollTop=0;}catch(e){/* no DOM: fine */}};// the ⚙: always faintly visible (35 %), bright while the mouse is over its
// window or its editor is open (frameRoot's .pw-gear rules); a drag from it
// moves the window (the title row's mousedown), and the click that ends such
// a drag never arrives (swallowClick)
const gearNode=(state,dispatch,style)=>html("span",{className:"pw-gear","data-pw-edit":"1","data-pw-open":state.editOpen?"1":"0",style:Object.assign({cursor:"pointer",fontSize:10,letterSpacing:0},state.editOpen?{opacity:1,color:C.ink}:null,style),title:state.editOpen?"close the editor (Esc)":"customise this window: what it shows, its size, more windows",onClick:ev=>{if(ev&&ev.detail>1)return;if(!state.editOpen)bodyToTop(ev);dispatch({type:"TOGGLE_EDITOR"});}},"\u2699");// Esc closes every open editor: one keydown listener while any is open
let editKeys=null;const armEditKeys=(on,dispatch)=>{if(typeof window==="undefined"||typeof window.addEventListener!=="function")return;if(on){if(editKeys){editKeys.dispatch=dispatch;return;}editKeys={dispatch:dispatch,fn:ev=>{if(editKeys&&isEscape(ev))editKeys.dispatch({type:"CLOSE_ALL_EDITORS"});}};window.addEventListener("keydown",editKeys.fn,true);}else if(editKeys){window.removeEventListener("keydown",editKeys.fn,true);editKeys=null;}};const edBox=(0,_uebersicht.css)(_templateObject136(),C.ink);const edHead=(0,_uebersicht.css)(_templateObject137(),C.dim);const edHeadOn=(0,_uebersicht.css)(_templateObject138(),C.ink);const edCaption=(0,_uebersicht.css)(_templateObject139(),C.dim);const edHint=(0,_uebersicht.css)(_templateObject140(),C.dim);const edLine=(0,_uebersicht.css)(_templateObject141());const edChip=(0,_uebersicht.css)(_templateObject142(),C.dim);const edChipOn=(0,_uebersicht.css)(_templateObject143(),C.ink);const edNum={width:50,fontSize:9.5,padding:"1px 4px",flex:"none"};const edText={flex:"1 1 80px",minWidth:0,fontSize:9.5,padding:"1px 4px"};const edLabel={whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",minWidth:0,cursor:"pointer"};const edDim={color:C.dim,whiteSpace:"nowrap"};const edMsg={color:C.amber,minWidth:0,whiteSpace:"normal"};const edNote={color:C.dim,minWidth:0,whiteSpace:"normal",fontSize:8.5};// a calm confirmation ("you have the newest version"): grey, only problems are amber
const edOk={color:C.dim,minWidth:0,whiteSpace:"normal"};// the "arrange" chips (13.2): friendly words, the saved ids stay always / normal / room
const PRIO_LABELS={always:"hide last",normal:"normal",room:"hide first"};const PRIO_TIPS={always:"stays when the window is short",normal:"",room:"hidden first when the window is short"};const EDIT_HINTS={portfolio:"Settings for the whole portfolio — every window shares them.",window:"Its name, place and size. Drag the title row to move it, the edges to resize.",arrange:"order, left / right column, what hides first when the window is short, move to another window",arrangeOff:"Tick what each part shows. arrange ▸ = change the order, left / right column, what hides first when the window is short, or move a part to another window.",header:"Tick what this window shows. If the window is too short, some panels hide until there is room.",graph:"The graph and the buttons around it.",panels:"The boxes under the graph.",holdings:"The holdings list, heat map and watchlist.",rows:"The columns of every holding row.",footer:"The dim row at the very bottom."};const EDIT_HEAD_TIPS={header:"Top numbers: the row of figures above the graph",graph:"Graph: the value graph and its buttons",panels:"Panels: the boxes under the graph",holdings:"Holdings: the list of what you own",rows:"Each holding's row: the columns in the list",footer:"Small print: the bottom row"};const SIZE_PRESETS=[["narrow",360],["normal",WIDGET_W],["wide",992]];const HISTORY_ORDER=["3","5","10","max"];const HISTORY_LABELS={"3":"3 years","5":"5 years","10":"10 years",max:"everything"};const PENDING_NOTE="takes effect on the next update (about a minute)";const TGT_HINT="The mix you are aiming for, in % of everything (holdings and cash). Give each sector one %, or split it by holding. "+"An empty row counts as 0 %. After saving, the rebalancing panel and the off-target badges use it from the next update (about a minute).";const PENDING_LONGER="loading more history — the graph fills in over the next few minutes";const ALERTS_NOTE="No notification? Allow Script Editor in System Settings → Notifications.";const CURRENCY_CHIPS=["USD","EUR","GBP","CAD"];const BENCH_NAME={};BENCH_GROUPS.forEach(g=>g.items.forEach(it=>{BENCH_NAME[it[0]]=it[1];}));// a field commits on Enter and again when it loses focus: the same value is
// sent once, until the reply is back (then a retry after an error works)
const edSent={};// the target mix last saved {obj, epoch}: the editor shows it until data.json (a newer epoch) carries it (13.6)
const tgtSent={obj:null,epoch:null};// 13.4: the ⚙ editor's "updates" row — what the last check found
// quick picks beside the slider (its ends already say glass and solid)
const OPACITY_CHIPS=[["normal",0.88,"a little see-through (the usual look)"],["lighter",0.7,"the desktop shows through a bit"]];const updateNoteOf=(d,state)=>{const u=d&&d.update&&typeof d.update==="object"?d.update:null;if(state.updateChecking)return null;// { text, tone }: "ok" = grey (all is well), "warn" = amber (something to do or look at)
const ok=text=>({text,tone:"ok"}),warn=text=>({text,tone:"warn"});if(!u)return ok(uiPrefs(state).updates===false?"not checking":"not checked yet — it happens at the next refresh");const when=isFin(u.checked)?" (checked "+fmtAge(Math.max(0,Math.round(Date.now()/1000-u.checked)))+" ago)":"";if(!u.latest)return u.ok===false?warn("the last check failed — GitHub unreachable?"+when):ok("nothing known yet"+when);if(newerVersion(u.latest,VERSION))return warn(u.latest+" is out — update in the bottom row"+when);return u.ok===false?warn("you have the newest version — the last check failed"+when):ok("you have the newest version"+when);};// "13.10" is newer than "13.4"; parts compared as numbers
const newerVersion=(a,b)=>{const pa=String(a||"").split("."),pb=String(b||"").split(".");for(let i=0;i<Math.max(pa.length,pb.length);i++){const x=Number(pa[i]||0),y=Number(pb[i]||0);if(!isFinite(x)||!isFinite(y))return false;if(x!==y)return x>y;}return false;};const checkUpdateNow=dispatch=>{dispatch({type:"UPDATE_CHECKING",on:true});(0,_uebersicht.run)(helper(["update","check"])).then(out=>{const r=parseJson(String(out).trim());dispatch({type:"UPDATE_INFO",info:r&&!r.error?r:{latest:null,ok:false,checked:Math.round(Date.now()/1000)}});},()=>dispatch({type:"UPDATE_INFO",info:{latest:null,ok:false,checked:Math.round(Date.now()/1000)}}));};// "reset portfolio settings": ONE run of `setting portfolio reset-all`; the
// reply's ui values go into data.ui at once, this session's clicks are dropped
const resetPortfolioSettings=dispatch=>runQueued(["setting","portfolio","reset-all"]).then(out=>{const r=parseJson(String(out).trim());if(!r||r.error)return dispatch({type:"EDIT_MSG",key:"portfolio",msg:r&&r.error||"could not reset"});dispatch({type:"PF_RESET_LOCAL"});Object.keys(r.ui||{}).forEach(k=>dispatch({type:"UI_PATCH",key:k,value:r.ui[k]}));dispatch({type:"EDIT_MSG",key:"portfolio",msg:null});offerUndo(out,dispatch);},()=>dispatch({type:"EDIT_MSG",key:"portfolio",msg:"could not reset"}));// state = the window's view, L = its layout (null in the one-line view),
// has = id -> false when the data has nothing for it yet
const editorNode=(state,dispatch,d,L,has)=>{if(!state.editOpen||!d)return null;const G=state._geo||winGeom(state);const id=G.win.id;const base=displayOf(state)||migrateDisplay(state);const dw=base.windows.find(w=>w.id===id)||{id:id};const others=base.windows.filter(w=>w.id!==id);const put=disp=>{if(disp)saveDisplay(disp,dispatch);};const setWin=patch=>put(patchWin(base,id,patch));const open=state.editGroup==="size"?"window":state.editGroup||"portfolio";const confirm=state.editConfirm;const hints=state.editHints!==false;const adv=state.editAdvanced===true;// the search box (13.4): with a word typed, every group shows only the rows
// whose label, hint or key carries it; a group with no such row goes
const q=String(state.editQuery||"").trim().toLowerCase();// (13.6: qRow is q, except "" while a group whose hint matched draws its body)
let qRow=q;const matches=(...texts)=>!qRow||texts.some(t=>String(t||"").toLowerCase().indexOf(qRow)>=0);// a row with no setting key: found by its words or its hint; the hint shows under it
const wrow=(words,node,hint)=>!matches(words,hint)?null:hints&&hint?[node,html("div",{key:node.key+":hint",className:edHint},hint)]:node;// does a rendered group body hold anything (its children, nested arrays included)?
const hasKids=node=>{const walk=k=>Array.isArray(k)?k.some(walk):k!==null&&k!==undefined&&k!==false&&k!=="";return!!(node&&node.props&&walk(node.props.children));};const ui=uiPrefs(state);const half=G.Wu-LAYOUT_K.PAD_X>=860;// two columns only where a panel row (chips and all) fits on one line
const set=itemSetOf(winItems(dw));const pfName=ui.title||d.name||"portfolio";const nameOf=w=>w.title||pfName;const chip=(label,on,onClick,title,key,pw)=>html("span",{key:key||label,className:on?(0,_uebersicht.css)(_templateObject144(),edChip,edChipOn):edChip,onClick:onClick,title:title||undefined,"data-pw-edchip":pw&&pw.chip,"data-pw-prio":pw&&pw.prio,"data-pw-edctl":pw&&pw.ctl,"data-pw-edadv":pw&&pw.adv,"data-pw-edhints":pw&&pw.hints},label);const group=(key,label,body,tip)=>{const isOpen=q?true:open===key;// 13.6: a search word in the group's hint shows the whole group ("drag", "resize")
const hintHit=!!q&&!!EDIT_HINTS[key]&&EDIT_HINTS[key].toLowerCase().indexOf(q)>=0;let node=null;if(isOpen){if(hintHit)qRow="";try{node=body();}finally{qRow=q;}}if(q&&!hasKids(node))return null;// nothing in here matches
return html("div",{key:key},html("div",{className:isOpen?(0,_uebersicht.css)(_templateObject145(),edHead,edHeadOn):edHead,"data-pw-edgroup":key,title:tip||undefined,onClick:()=>{if(!q)dispatch({type:"EDIT_GROUP",group:open===key?"none":key});}},(isOpen?"▾ ":"▸ ")+label),isOpen&&hints&&(!q||hintHit)&&EDIT_HINTS[key]?html("div",{className:edHint},EDIT_HINTS[key]):null,node);};// ---- portfolio: _settings the file used to be the only way to (13.2)
const msgOf=key=>state.editMsg&&state.editMsg[key]||null;const pend=state.settingPending;const pendNote=key=>pend&&pend.key===key&&d.epoch!=null&&pend.epoch===d.epoch?pend.msg||PENDING_NOTE:null;// extra: a string (amber, as before 13.5) or { text, tone } with tone "ok" (grey) | "warn" (amber)
const rowMsg=(key,extra)=>{const ex=extra&&typeof extra==="object"?extra:extra?{text:String(extra),tone:"warn"}:null;const err=msgOf(key),x=err?null:ex&&ex.text?ex:null;const m=err||(x?x.text:null),n=m?null:pendNote(key);const tone=err?"warn":x?x.tone==="ok"?"ok":"warn":"note";return m||n?html("div",{key:"msg:"+key,className:edLine,"data-pw-edmsg":key,"data-pw-tone":tone,style:{marginTop:1}},html("span",{style:tone==="ok"?edOk:tone==="warn"?edMsg:edNote},m||n)):null;};// 13.6: in a narrow window a row of 4+ chips puts its label on a line of its own,
// so every chip line starts at the same place
const edNarrow=G.Wu<LAYOUT_K.NARROW;const srow=(key,label,body,hint,extraMsg)=>!matches(key,label,hint)?null:html("div",{key:"s:"+key,"data-pw-edsetting":key},html("div",{className:edLine},html("span",{style:edNarrow&&Array.isArray(body)&&body.length>=4?Object.assign({},edDim,{flex:"0 0 100%"}):edDim},label),body),hints&&hint?html("div",{className:edHint},hint):null,rowMsg(key,extraMsg));const save=(key,value,after)=>{const v=String(value);if(edSent[key]===v)return;edSent[key]=v;dispatch({type:"EDIT_MSG",key:key,msg:null});saveSetting(key,v,dispatch).then(r=>{edSent[key]=null;if(r&&r.ok&&after)after(r);});};const pending=(key,msg)=>()=>dispatch({type:"SETTING_PENDING",key:key,epoch:d.epoch,msg:msg});const titleNow=typeof ui.title==="string"?ui.title:d.name||"";const commitPfTitle=ev=>{const t=cleanTitle(ev.target.value);if(ev.target.value!==t)ev.target.value=t;if(t.toLowerCase()==="default"){// set_setting's remove-word: it would reset the name, not save it
dispatch({type:"EDIT_MSG",key:"title",msg:"'default' is reserved — pick another name"});return;}if(t!==(titleNow==="portfolio"?"":titleNow))save("title",t);// "" = back to "portfolio"
};const curNow=typeof ui.currency==="string"&&ui.currency?ui.currency:"auto";const curCustom=curNow!=="auto"&&CURRENCY_CHIPS.indexOf(curNow)<0;const saveCur=v=>{dispatch({type:"EDIT_CONFIRM",what:null});save("currency",v,pending("currency",PENDING_NOTE));};const commitCur=ev=>{const raw=String(ev.target.value).trim();if(!raw)return;if(!/^[A-Za-z]{3}$/.test(raw)){dispatch({type:"EDIT_MSG",key:"currency",msg:"currency must be a 3-letter code (EUR, GBP, SEK) or auto, got '"+raw+"'"});return;}ev.target.value=raw.toUpperCase();if(raw.toUpperCase()!==curNow)saveCur(raw.toUpperCase());};// cash on hand and money put in (13.5): _cash / _invested next to _settings
const cashNow=ui.cash&&typeof ui.cash==="object"&&!Array.isArray(ui.cash)?ui.cash:{};const cashIsos=Object.keys(cashNow).filter(k=>isFin(cashNow[k])).sort();const invRaw="invested"in ui?ui.invested:d.totals&&d.totals.invested;const invNow=isFin(invRaw)&&invRaw>0?invRaw:null;// Enter in either field, or the "add" chip: no blur commit (tabbing to the currency must not save)
const commitCash=ev=>{const row=ev.currentTarget.closest("[data-pw-edsetting=cash]");const amtEl=row&&row.querySelector("[data-pw-edfield=cash]"),curEl=row&&row.querySelector("[data-pw-edfield=cashCur]");if(!amtEl||!curEl)return;const amt=String(amtEl.value).trim(),cur=String(curEl.value).trim();if(!amt)return;if(!/^[A-Za-z]{3}$/.test(cur)){dispatch({type:"EDIT_MSG",key:"cash",msg:"the currency must be a 3-letter code, like CAD or EUR"});return;}curEl.value=cur.toUpperCase();save("cash",cur.toUpperCase()+" "+amt,pending("cash",PENDING_NOTE));amtEl.value="";};const invCommit=ev=>{const raw=String(ev.target.value).trim();if(!raw){if(invNow!==null)save("invested","default",pending("invested",PENDING_NOTE));return;}if(Number(raw)===invNow)return;save("invested",raw,pending("invested",PENDING_NOTE));};// 13.6: the goal (Enter in either field, or "save"; no blur commit, as with cash)
const gNow=goalOf(d);const goalV=goalView(d);const commitGoal=ev=>{const row=ev.currentTarget.closest("[data-pw-edsetting=goal]");const amtEl=row&&row.querySelector("[data-pw-edfield=goal]"),dateEl=row&&row.querySelector("[data-pw-edfield=goalDate]");if(!amtEl||!dateEl)return;const amtText=String(amtEl.value).trim(),raw=String(dateEl.value).trim();if(!amtText)return;const dateText=/^\d{4}$/.test(raw)?raw:parseDateLoose(raw);if(!dateText){dispatch({type:"EDIT_MSG",key:"goal",msg:"the date must be a year like 2035 or a date like 2035-06-30"});return;}if(!gNow){// a first goal: customised windows get the goal line too (as its own undo record, saved first)
let disp=base,changed=false;((displayOf(state)||{}).windows||[]).forEach(w=>{if(!w||!Array.isArray(w.items)||w.items.indexOf("header.value")<0||w.items.indexOf("header.goal")>=0)return;const items=w.items.slice();insertItem(items,"header.goal");disp=patchWin(disp,w.id,{items:items});changed=true;});if(changed){saveDisplay(disp,dispatch);if(dispSave.timer){clearTimeout(dispSave.timer);flushDisplay();}// now, so the goal is the newest undo record
}}// the currency the row shows: a goal set in another currency stays in it (re-saving it in
// the portfolio currency only when there is no exchange rate, as the warn line says)
const goalCur=gNow&&gNow.cur&&!(goalV&&goalV.noRate)?gNow.cur:d.currency||"USD";save("goal",goalCur+" "+amtText+" "+dateText);};const btRaw=ui.backtestYears!=null?ui.backtestYears:d.backtestYears;const btNow=HISTORY_ORDER.indexOf(String(btRaw))>=0?String(btRaw):"5";const saveBt=v=>save("backtestYears",v,pending("backtestYears",HISTORY_ORDER.indexOf(v)>HISTORY_ORDER.indexOf(btNow)?PENDING_LONGER:PENDING_NOTE));const benchNow=benchWantOf(state,d)||"auto";const benchDef=benchDefault(d.currency);const benchList=[];benchGroupsFor(d.currency).forEach(g=>g.items.forEach(it=>{if(benchList.length<6)benchList.push(it[0]);}));const benchCustom=benchNow!=="auto"&&benchNow!=="none"&&benchList.indexOf(benchNow)<0;const benchLabel=s=>BENCH_NAME[s]?BENCH_NAME[s]+" ("+s+")":s;const pickIdx=v=>{dispatch({type:"EDIT_CONFIRM",what:null});pickBench(v,!showBenchOf(state),dispatch);};const commitBench=ev=>{const raw=String(ev.target.value).trim();if(!raw||raw.toUpperCase()===benchNow)return;submitBenchInput(raw,!showBenchOf(state),dispatch);};const alertsNow=typeof ui.alerts==="boolean"?ui.alerts:d.alertsOn===true;const thrNow=(key,dflt)=>isFin(ui[key])?ui[key]:dflt;const thrCommit=(key,lo,hi,cur)=>ev=>{const raw=String(ev.target.value).trim(),n=Number(raw);if(!raw||raw.toLowerCase()==="default"){// empty or the word: back to the default
ev.target.value=String(cur);// (the field re-keys when the value changes)
save(key,"default");return;}if(!isFinite(n)||n<lo||n>hi){dispatch({type:"EDIT_MSG",key:key,msg:"must be a number from "+lo+" to "+hi+" (%), or empty for the default — got '"+raw+"'"});return;}if(n!==cur)save(key,raw);};const thrField=(key,lo,hi,cur)=>html("input",{key:key+":"+cur,className:inputCss,style:edNum,defaultValue:String(cur),inputMode:"decimal","data-pw-edfield":key,title:lo+"–"+hi+" % (Enter)",onKeyDown:ev=>{if(isEnter(ev))thrCommit(key,lo,hi,cur)(ev);},onBlur:thrCommit(key,lo,hi,cur)});const rbNow=typeof state.rebalWhole==="boolean"?state.rebalWhole:typeof ui.rebalanceWhole==="boolean"?ui.rebalanceWhole:null;// ---- the target mix (13.6): one % per sector (or per holding, "by holding") and cash, typed
// into a per-window draft; "save target mix" or Enter in a field writes _settings.targets
const tgtModelNow=()=>tgtModel(d,tgtSent.obj&&d.epoch!=null&&tgtSent.epoch===d.epoch?tgtSent.obj:null);const tgtR2=v=>String(Math.round(v*100)/100);const tgtAfter=obj=>()=>{tgtSent.obj=obj;tgtSent.epoch=d.epoch;dispatch({type:"TGT_RESET"});pending("targets",PENDING_NOTE)();};const tgtSaveMix=(model,draft)=>{const c=tgtCollect(model,draft);if(c.bad.length)return dispatch({type:"EDIT_MSG",key:"targets",msg:c.bad[0]+": a target is a number from 0 to 100"});const empty=!Object.keys(c.obj).length;save("targets",empty?"default":JSON.stringify(c.obj),tgtAfter(empty?{}:c.obj));};// "now 21.8 %" (narrow window: "21.8 %", the rest in the title); one width, so the fields line up
const tgtNowCss=Object.assign({},edDim,{minWidth:edNarrow?40:64,flex:"none"});const tgtNow=pct=>edNarrow?html("span",{key:"now",style:tgtNowCss,title:"now "+num(pct,1)+" % of everything"},num(pct,1)+" %"):html("span",{key:"now",style:tgtNowCss},"now "+num(pct,1)+" %");const tgtField=(model,draft,key)=>{const text=tgtText(model,draft,key),bad=isNaN(tgtParse(text));return[html("input",{key:"in:"+key,className:inputCss,value:text,inputMode:"decimal",placeholder:"0",style:Object.assign({},edNum,{width:40},bad?{color:C.down}:null),"data-pw-edfield":"tgt:"+key,"data-pw-bad":bad?"1":undefined,title:"% of everything (Enter saves the mix)",onChange:ev=>dispatch({type:"TGT_DRAFT",key:key,value:ev.target.value}),onKeyDown:ev=>{if(isEnter(ev))tgtSaveMix(model,draft);}}),html("span",{key:"pc:"+key,style:edDim},"%")];};// "by holding" / "as one": a draft starts from the saved mix first
const tgtSplitTo=(model,draft,name,on)=>{if(!draft){const vals={};Object.keys(model.saved).forEach(k=>{vals[k]=String(model.saved[k]);});dispatch({type:"TGT_FILL",vals:vals,split:model.split0});}dispatch({type:"TGT_SPLIT",sector:name,on:on});};// one line per sector (its holdings under it when split), then cash
const tgtLines=(model,draft,c)=>{const nameCss={color:C.dim,width:edNarrow?72:96,flex:"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"};const rows=[];model.sectors.forEach(s=>{const sp=tgtSplitOf(model,draft,s.name);rows.push(html("div",{key:"tgt:s:"+s.name,className:edLine,"data-pw-tgtrow":"s:"+s.name},html("span",{style:nameCss,title:s.name+": "+s.tickers.map(t=>t.ticker).join(", ")},s.name),tgtNow(s.nowPct),sp?html("span",{style:edDim,"data-pw-tgtsum":"1",title:"its holdings' % added up"},"= "+tgtR2(c.sums[s.name]||0)+" %"):tgtField(model,draft,"s:"+s.name),s.tickers.length>=2||sp?chip(sp?"as one":"by holding",false,()=>tgtSplitTo(model,draft,s.name,!sp),sp?"one % for the whole sector":"a % for each holding in it","tgt:split:"+s.name,{chip:"split:"+s.name}):null));if(sp)s.tickers.forEach(t=>rows.push(html("div",{key:"tgt:t:"+t.ticker,className:edLine,"data-pw-tgtrow":"t:"+t.ticker,style:{paddingLeft:14}},html("span",{className:mono,style:{width:edNarrow?58:82,flex:"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},t.ticker),tgtNow(t.nowPct),tgtField(model,draft,"t:"+t.ticker))));});rows.push(html("div",{key:"tgt:cash",className:edLine,"data-pw-tgtrow":"cash"},html("span",{style:nameCss},"cash"),tgtNow(model.cashNow),tgtField(model,draft,"cash")));return rows;};const tgtRow=()=>{if(!matches("targets target mix rebalancing sectors off-target drift","target mix",TGT_HINT))return null;// ("drift": old wording)
const tail=[hints?html("div",{key:"tgt:hint",className:edHint},TGT_HINT):null,rowMsg("targets")];if(!Array.isArray(d.positions)||!d.positions.length)return html("div",{key:"s:targets","data-pw-edsetting":"targets"},html("div",{className:edHint,"data-pw-ednote":"targets"},"add a holding first \u2014 then set the mix here"));const model=tgtModelNow(),draft=state.tgtDraft||null;if(!draft&&!model.any)return(// collapsed: nothing saved, nothing typed
html("div",{key:"s:targets","data-pw-edsetting":"targets"},html("div",{className:edLine,"data-pw-ednote":"targets"},html("span",{style:edDim},"target mix"),html("span",{style:edOk},"not set \u2014 the rebalancing panel needs one"),chip("set one",false,()=>dispatch({type:"TGT_FILL",vals:{},split:{}}),"type a % for each sector","tgt:open",{chip:"tgt:open"}),chip("start from today's mix",false,()=>dispatch(Object.assign({type:"TGT_FILL"},todaysMix(model))),"fill in each sector's share today — then change what you like","tgt:today",{chip:"tgt:today"})),tail));const c=tgtCollect(model,draft),dirty=tgtDirty(model,draft);const tone=c.bad.length?"bad":!Object.keys(c.obj).length?"empty":Math.abs(c.sum-100)<=0.01?"ok":c.sum<100?"left":"over";const total={ok:"adds up to 100 % ✓",left:tgtR2(100-c.sum)+" % left to place",over:tgtR2(c.sum-100)+" % too much — lower a row",bad:"fix the red field",empty:""}[tone];const nested=model.nested.filter(n=>!tgtSplitOf(model,draft,n.sector));return html("div",{key:"s:targets","data-pw-edsetting":"targets"},html("div",{className:edLine},html("span",{style:edDim},"target mix"),html("span",{style:tone==="ok"?edOk:edMsg,"data-pw-tgttotal":tone},total),dirty?html("span",{style:edMsg,"data-pw-tgtdirty":"1"},(total?"· ":"")+"not saved yet"):null),tgtLines(model,draft,c),model.stale.length?html("div",{className:edLine,"data-pw-tgtstale":"1"},html("span",{style:edNote},"not held any more: "+model.stale.map(x=>x[0]+" "+tgtR2(x[1])+" %").join(", ")+" — left out when you save")):null,nested.length?html("div",{className:edLine,"data-pw-tgtnested":"1"},html("span",{style:edNote},nested.map(n=>n.ticker+"'s own % is not used — its sector "+n.sector+" has one.").join(" ")+' Use "by holding" to set each holding instead.')):null,html("div",{className:edLine},html("span",{key:"tgt:save",className:dirty?(0,_uebersicht.css)(_templateObject146(),edChip,edChipOn):edChip,style:dirty?undefined:{opacity:0.5,cursor:"default"},"data-pw-edchip":"tgt:save","data-pw-off":dirty?undefined:"1",onClick:dirty?()=>tgtSaveMix(model,draft):undefined,title:dirty?"save the mix (Enter in any field does the same)":"nothing changed"},"save target mix"),draft?chip("undo changes",false,()=>dispatch({type:"TGT_RESET"}),"back to the saved mix","tgt:undo",{chip:"tgt:undo"}):null,chip("use today's mix",false,()=>dispatch(Object.assign({type:"TGT_FILL"},todaysMix(model))),"each sector's share today, in whole %","tgt:today",{chip:"tgt:today"}),model.any?chip("remove target mix",confirm==="tgt:clear",()=>dispatch({type:"EDIT_CONFIRM",what:confirm==="tgt:clear"?null:"tgt:clear"}),undefined,"tgt:clear",{chip:"tgt:clear"}):null),confirm==="tgt:clear"?html("div",{className:edLine,"data-pw-edconfirm":"tgt:clear"},html("span",{style:edMsg},"remove the target mix? the rebalancing panel and the off-target badges go away"),chip("yes, remove",false,()=>{dispatch({type:"EDIT_CONFIRM",what:null});save("targets","default",tgtAfter({}));},undefined,"tgt:clear:yes",{chip:"tgt:clear:yes"}),chip("no",false,()=>dispatch({type:"EDIT_CONFIRM",what:null}),undefined,"tgt:clear:no",{chip:"tgt:clear:no"})):null,tail);};// appearance and the update check (13.4)
const themeSaved=typeof ui.theme==="string"&&THEMES.indexOf(ui.theme)>=0?ui.theme:"dark";const opSaved=opacitySaved(state),opNow=opacityOf(state);// the background slider (13.5): previews while dragged (OPACITY_DRAFT), saves on release
const opCommit=ev=>{const pct=Math.min(100,Math.max(30,Math.round(Number(ev.target.value))||0));if(pct===Math.round(opSaved*100))return dispatch({type:"OPACITY_DRAFT",value:null});save("opacity",pct+"%");};const updOn=ui.updates!==false;const updateNote=updateNoteOf(d,state);const portfolioBody=()=>html("div",null,srow("title","portfolio name",[html("input",{key:"pt:"+titleNow,className:inputCss,style:edText,defaultValue:titleNow==="portfolio"?"":titleNow,placeholder:"portfolio",maxLength:40,"data-pw-edfield":"title",title:"the portfolio's name (Enter to keep it)",onKeyDown:ev=>{if(isEnter(ev))commitPfTitle(ev);},onBlur:commitPfTitle})]),srow("currency","currency",[chip("auto (now "+(d.currency||"USD")+")",curNow==="auto",()=>saveCur("auto"),"your Mac's region decides","cur:auto",{chip:"auto"})].concat(CURRENCY_CHIPS.map(c=>chip(c,curNow===c,()=>saveCur(c),undefined,"cur:"+c,{chip:c})),[chip(curCustom?curNow:"other…",curCustom||confirm==="cur:other",()=>dispatch({type:"EDIT_CONFIRM",what:confirm==="cur:other"?null:"cur:other"}),"any 3-letter code, like SEK or JPY","cur:other",{chip:"other"})],curCustom||confirm==="cur:other"?[html("input",{key:"cur:"+curNow,className:inputCss,style:edNum,defaultValue:curCustom?curNow:"",placeholder:"SEK",maxLength:3,"data-pw-edfield":"currency",title:"a 3-letter code (Enter)",onKeyDown:ev=>{if(isEnter(ev))commitCur(ev);},onBlur:commitCur})]:[]),"The money everything is shown in. auto = your Mac's region."),srow("cash","cash on hand",[].concat.apply([],cashIsos.map(c=>{// 13.6: × asks first (yes / no); clicking the question again keeps the cash
const v=cashNow[c],amt=num(v,v%1?2:0),asking=confirm==="cash:"+c;const ask=()=>dispatch({type:"EDIT_CONFIRM",what:asking?null:"cash:"+c});return!asking?[chip(c+" "+amt+" ×",false,ask,"remove this cash (asks first)","cash:"+c,{chip:"cash:"+c})]:[chip("remove "+c+" "+amt+"?",true,ask,"click to keep it","cash:"+c,{chip:"cash:"+c}),chip("yes, remove",false,()=>{dispatch({type:"EDIT_CONFIRM",what:null});save("cash",c+" default",pending("cash",PENDING_NOTE));},undefined,"cash:yes",{chip:"cash:yes"}),chip("no",false,()=>dispatch({type:"EDIT_CONFIRM",what:null}),undefined,"cash:no",{chip:"cash:no"})];})).concat([html("input",{key:"cash:amt",className:inputCss,style:edNum,placeholder:"amount",inputMode:"decimal","data-pw-edfield":"cash",title:"an amount, then Enter",onKeyDown:ev=>{if(isEnter(ev))commitCash(ev);}}),html("input",{key:"cash:cur:"+(d.currency||"USD"),className:inputCss,style:edNum,defaultValue:d.currency||"USD",maxLength:3,"data-pw-edfield":"cashCur",title:"the currency of this cash, like CAD or EUR",onKeyDown:ev=>{if(isEnter(ev))commitCash(ev);}}),chip("add",false,commitCash,"save this amount (an amount for a currency already listed replaces it)","cash:add",{chip:"cash:add"})]),"money not invested — counted in the total and used by the rebalance panel. Typing a currency again replaces its amount; × removes it."),srow("invested","money put in so far",[html("input",{key:"inv:"+invNow,className:inputCss,style:edNum,defaultValue:invNow?String(invNow):"",placeholder:"amount",inputMode:"decimal","data-pw-edfield":"invested",title:"everything you have paid in (Enter)",onKeyDown:ev=>{if(isEnter(ev))invCommit(ev);},onBlur:invCommit}),html("span",{key:"inv:cur",style:edDim},d.currency||"USD")],"everything you have paid in so far, in the portfolio currency — the profit line in the header can then be shown against it (click it); buys and sells keep it up to date"),srow("goal","a goal to reach",[html("input",{key:"goal:"+(gNow?gNow.value:""),className:inputCss,style:edNum,"data-pw-edfield":"goal",placeholder:"250000",inputMode:"decimal",defaultValue:gNow?String(gNow.value):"",title:"the amount (Enter)",onKeyDown:ev=>{if(isEnter(ev))commitGoal(ev);}}),html("span",{key:"goal:cur",style:edDim},gNow&&gNow.cur?gNow.cur:d.currency||"USD"),html("span",{key:"goal:by",style:edDim},"by"),html("input",{key:"goalD:"+(gNow?gNow.date:""),className:inputCss,style:edNum,"data-pw-edfield":"goalDate",placeholder:"2035",maxLength:10,defaultValue:gNow?/-12-31$/.test(gNow.date)?gNow.date.slice(0,4):gNow.date:"",title:"a year like 2035 or a date like 2035-06-30 (Enter)",onKeyDown:ev=>{if(isEnter(ev))commitGoal(ev);}}),chip("save",false,commitGoal,"save the goal","goal:save",{chip:"goal:save"})].concat(gNow?[chip("remove",false,()=>save("goal","default"),"no goal","goal:off",{chip:"goal:off"})]:[]),"An amount you want the portfolio to reach and when — the header shows how far along you are, and (after a year of history) whether your annual return so far gets you there. Not a forecast.",goalV&&goalV.noRate?{tone:"warn",text:"your goal is in "+gNow.cur+" — save it again to set it in "+d.currency}:null),srow("backtestYears","history",HISTORY_ORDER.map(v=>chip(HISTORY_LABELS[v],btNow===v,()=>saveBt(v),undefined,"bt:"+v,{chip:v})),"How far back the graph and 'what if you had bought earlier' go. everything = all the prices Yahoo has. A longer history loads once and takes a few minutes."),srow("benchmark","compare with an index",[chip("auto ("+(BENCH_NAME[benchDef]||benchDef)+" · "+benchDef+")",benchNow==="auto",()=>pickIdx("auto"),"the usual index for your currency","bench:auto",{chip:"auto"}),chip("none",benchNow==="none",()=>pickIdx("none"),"no index line","bench:none",{chip:"none"})].concat(benchList.map(s=>chip(benchLabel(s),benchNow===s,()=>pickIdx(s),undefined,"bench:"+s,{chip:s})),[chip(benchCustom?benchLabel(benchNow):"other…",benchCustom||confirm==="bench:other",()=>dispatch({type:"EDIT_CONFIRM",what:confirm==="bench:other"?null:"bench:other"}),"type any Yahoo symbol, like VOO","bench:other",{chip:"other"})],benchCustom||confirm==="bench:other"?[html("input",{key:"bench:"+benchNow,className:inputCss,style:{width:70,fontSize:9.5,padding:"1px 4px",flex:"none"},defaultValue:benchCustom?benchNow:"",placeholder:"VOO","data-pw-edfield":"benchmark",title:"a Yahoo symbol (Enter)",onKeyDown:ev=>{if(isEnter(ev))commitBench(ev);},onBlur:commitBench})]:[]),"The thin grey line on the graph: an index to compare your portfolio with. auto = the usual one for your currency (the S&P 500 for dollars).",state.benchMsg||null),srow("news","headlines",[chip("on",newsOn(state),()=>savePref("news",true,dispatch),undefined,"news:on",{chip:"true"}),chip("off",!newsOn(state),()=>savePref("news",false,dispatch),undefined,"news:off",{chip:"false"})],"Loads headlines from Yahoo. Off = no news anywhere in the widget."),srow("alerts","big-move alerts",[chip("on",alertsNow,()=>save("alerts","true",()=>{dispatch({type:"EDIT_MSG",key:"alerts",msg:ALERTS_NOTE});setTimeout(()=>dispatch({type:"EDIT_MSG",key:"alerts",msg:null}),5000);}),undefined,"al:on",{chip:"true"}),chip("off",!alertsNow,()=>save("alerts","false"),undefined,"al:off",{chip:"false"})],"Shows a Mac notification, at most once per stock a day."),alertsNow?srow("alertThreshold","a holding moves more than",[thrField("alertThreshold",0.5,50,thrNow("alertThreshold",5)),html("span",{key:"pc",style:edDim},"%")]):null,alertsNow?srow("portfolioAlertThreshold","the portfolio moves more than",[thrField("portfolioAlertThreshold",0.1,50,thrNow("portfolioAlertThreshold",2.5)),html("span",{key:"pc",style:edDim},"%")]):null,tgtRow(),targetsOn(d)?srow("rebalanceWhole","rebalancing suggests",[chip("whole shares only",rbNow===true,()=>saveRebalWhole(true,dispatch),undefined,"rb:true",{chip:"true"}),chip("fractions of a share",rbNow===false,()=>saveRebalWhole(false,dispatch),undefined,"rb:false",{chip:"false"}),chip("let the widget choose",rbNow===null,()=>saveRebalWhole(null,dispatch),"whole shares when every holding is a whole number of shares","rb:default",{chip:"default"})],"how the rebalance panel rounds its buy / sell amounts"):null,srow("theme","look",[chip("dark",themeSaved==="dark",()=>save("theme","dark"),"light text on a dark card","th:dark",{chip:"dark"}),chip("light",themeSaved==="light",()=>save("theme","light"),"dark text on a light card","th:light",{chip:"light"}),chip("follow my Mac",themeSaved==="auto",()=>save("theme","auto"),"dark or light with the Mac's appearance (System Settings → Appearance)","th:auto",{chip:"auto"})],"Dark, light, or whatever the Mac is set to."),srow("opacity","background",[html("span",{key:"op:lo",style:edDim},"glass"),html("input",{key:"op:"+opSaved+":"+(msgOf("opacity")||""),type:"range",min:"30",max:"100",step:"1",defaultValue:String(Math.round(opSaved*100)),style:{flex:"1 1 60px",minWidth:50,maxWidth:180,margin:0},"data-pw-edfield":"opacity",title:"drag: how solid the window's background is",onChange:ev=>dispatch({type:"OPACITY_DRAFT",value:Number(ev.target.value)/100}),onMouseUp:opCommit,onKeyUp:opCommit,onTouchEnd:opCommit}),html("span",{key:"op:hi",style:edDim},"solid"),html("span",{key:"op:now",style:edDim,"data-pw-edopacity":"1"},Math.round(opNow*100)+" %"),html("span",{key:"op:qp",style:edDim},"\xB7 quick picks:")].concat(OPACITY_CHIPS.map(o=>chip(o[0],Math.round(opSaved*100)===Math.round(o[1]*100),()=>save("opacity",String(o[1])),o[2],"op:"+o[0],{chip:String(o[1])}))),"How solid the window is — glass lets the desktop show through."),srow("updates","updates",[chip("check once a day",updOn,()=>save("updates","true"),"asks GitHub for the newest version once a day — one plain request, nothing about you in it","up:on",{chip:"true"}),chip("never",!updOn,()=>save("updates","false"),"no requests to GitHub; look at the releases page yourself","up:off",{chip:"false"}),chip(state.updateChecking?"checking…":"check now",false,()=>{if(!state.updateChecking)checkUpdateNow(dispatch);},"ask GitHub right now","up:now",{chip:"now"})],"You have "+VERSION+". A newer version is offered in the bottom row; one click installs it and keeps your holdings.",updateNote),srow("welcome","welcome card",[chip("show",ui.welcome!==false,()=>save("welcome","true"),"the first-steps card at the top of the first window","wc:on",{chip:"true"}),chip("hide",ui.welcome===false,()=>save("welcome","false"),undefined,"wc:off",{chip:"false"})],"The first-steps card, shown while the holdings are still the demo's (or there are none yet)."),wrow("reset portfolio settings defaults",html("div",{key:"pfreset",className:edLine,"data-pw-edsetting":"portfolio"},confirm==="pfreset"?[html("span",{key:"q",style:{color:C.down,minWidth:0,whiteSpace:"normal"}},"currency, history, index, headlines, alerts, rebalancing, look, updates and the welcome card back to the defaults? (your holdings, the name, the windows, cash and money put in stay)"),chip("yes, reset them",false,()=>{dispatch({type:"EDIT_CONFIRM",what:null});resetPortfolioSettings(dispatch);},undefined,"pf:yes",{chip:"yes"}),chip("no",false,()=>dispatch({type:"EDIT_CONFIRM",what:null}),undefined,"pf:no",{chip:"no"})]:chip("reset portfolio settings",false,()=>dispatch({type:"EDIT_CONFIRM",what:"pfreset"}),"every setting in this group back to its default — holdings, name, targets, windows, cash and money put in stay","pf:reset",{chip:"reset"}))));// ---- this window: name, one line, size presets / width / height / zoom,
// the carousel, new / duplicate / remove / reset
const commitTitle=ev=>{const t=cleanTitle(ev.target.value);if(ev.target.value!==t)ev.target.value=t;if(t!==(dw.title||""))setWin({title:t||undefined});};const wNow=G.g&&isNumber(G.g.w)?G.g.w:isNumber(dw.w)?dw.w:WIDGET_W;const hNow=G.g&&isNumber(G.g.h)?G.g.h:isNumber(dw.h)?dw.h:null;const zSaved=validScale(dw.zoom)||1;const zNow=G.s;const preset=hNow===null?SIZE_PRESETS.find(p=>p[1]===wNow):null;const sizeCustom=!preset||confirm==="size:custom";// Enter / leaving the field: the number, clamped (the clamped one is shown)
const commitNum=(lo,hi,cur,apply,empty)=>ev=>{const t=ev.target,raw=String(t.value).trim();if(!raw||/^auto$/i.test(raw)){if(empty){t.value="";if(cur!==null)apply(undefined);}else t.value=String(cur);return;}const n=Number(raw);if(!isFinite(n)){t.value=cur===null?"":String(cur);return;}const c=clampInt(n,lo,hi);t.value=String(c);if(c!==cur)apply(c);};const onW=commitNum(WIN_W_MIN,WIN_W_MAX,wNow,v=>setWin({w:v===WIDGET_W?undefined:v}),false);const onH=commitNum(WIN_H_MIN,WIN_H_MAX,hNow,v=>setWin({h:v}),true);const realH=ev=>{try{const root=ev.currentTarget.closest("[data-pw-win]");return root.firstChild.getBoundingClientRect().height/G.s;}catch(e){return null;}};// the slider previews live (a GEO draft) and saves on release
const zoomCommit=ev=>{const z=snapScale(Number(ev.target.value)/100);if(z===zSaved&&!(G.win.legacy&&z!==scaleOf(state)))return dispatch({type:"GEO",geo:null});setWin({zoom:z===1?undefined:z});};const winBody=()=>html("div",null,wrow("window name",html("div",{key:"wname",className:edLine},html("span",{style:edDim},"window name"),html("input",{className:inputCss,style:edText,key:"title:"+(dw.title||""),defaultValue:dw.title||"",placeholder:pfName,maxLength:40,title:"this window's name (Enter to keep it)",onKeyDown:ev=>{if(isEnter(ev))commitTitle(ev);},onBlur:commitTitle})),"empty = the portfolio's name"),wrow("collapse to one line compact",html("div",{key:"compact",className:edLine},chip((dw.compact===true?"☑ ":"☐ ")+"collapse to one line",dw.compact===true,()=>setWin({compact:dw.compact===true?undefined:true}),"just the name, value and today's change — or click the title","compact")),"just the name, value and today's change — clicking the title does the same"),wrow("size narrow normal wide custom width height",html("div",{key:"size",className:edLine},html("span",{style:edDim},"size"),SIZE_PRESETS.map(p=>chip(p[0]+" ("+p[1]+")",!sizeCustom&&preset===p,()=>{dispatch({type:"EDIT_CONFIRM",what:null});setWin({w:p[1]===WIDGET_W?undefined:p[1],h:undefined});},p[1]+" px wide, as tall as its content","size:"+p[0],{chip:p[0]})),chip("custom",sizeCustom,()=>dispatch({type:"EDIT_CONFIRM",what:sizeCustom?null:"size:custom"}),"type the width and height","size:custom",{chip:"custom"})),"pick a width, or drag the window's edges to resize it; custom = type the width and height"),sizeCustom&&matches("size width height custom")?html("div",{className:edLine},html("span",{style:edDim},"width"),html("input",{className:inputCss,style:edNum,key:"w:"+wNow,defaultValue:String(wNow),inputMode:"numeric",title:WIN_W_MIN+"–"+WIN_W_MAX+" px (Enter)","data-pw-edfield":"w",onKeyDown:ev=>{if(isEnter(ev))onW(ev);},onBlur:onW}),html("span",{style:edDim},"height"),html("input",{className:inputCss,style:edNum,key:"h:"+hNow,defaultValue:hNow===null?"":String(hNow),placeholder:"auto",inputMode:"numeric",title:WIN_H_MIN+"–"+WIN_H_MAX+" px (Enter), empty = as tall as its content","data-pw-edfield":"h",onKeyDown:ev=>{if(isEnter(ev))onH(ev);},onBlur:onH}),chip((hNow===null?"☑":"☐")+" shrink to fit",hNow===null,ev=>setWin({h:hNow===null?clampInt(realH(ev)||(L&&isNumber(L.T)?L.T+LAYOUT_K.CHROME:400),WIN_H_MIN,WIN_H_MAX):undefined}),"as tall as its content (a fixed height hides panels that don't fit)","fit")):null,wrow("zoom bigger smaller",html("div",{key:"zoom",className:edLine},html("span",{style:edDim},"zoom"),html("span",{style:edDim},"smaller"),html("input",{type:"range",min:"60",max:"160",step:"5",key:"z:"+zSaved,defaultValue:String(Math.round(zSaved*100)),style:{flex:"1 1 60px",minWidth:50,maxWidth:180,margin:0},"data-pw-edfield":"zoom",title:"everything in this window bigger or smaller",onChange:ev=>dispatch({type:"GEO",geo:Object.assign({},G.g||{},{id:id,zoom:Number(ev.target.value)/100})}),onMouseUp:zoomCommit,onKeyUp:zoomCommit,onTouchEnd:zoomCommit}),html("span",{style:edDim},"bigger"),html("span",{style:edDim},Math.round(zNow*100)+" %"))),wrow("left-side boxes take turns carousel rotate stack today sectors risk days",html("div",{key:"car",className:edLine},html("span",{style:edDim},"left-side boxes"),chip("rotate",dw.carousel!=="stack",()=>setWin({carousel:undefined}),"today · sectors · risk · days take turns","car:rotate"),chip("stack",dw.carousel==="stack",()=>setWin({carousel:"stack"}),"all of them, one under the other","car:stack")),"today, sectors, risk and days on the left: one at a time, taking turns — or all stacked"),wrow("new window duplicate remove delete template",html("div",{key:"winops",className:edLine},base.windows.length<MAX_WINDOWS?chip("+ new window ▾",confirm==="new",()=>dispatch({type:"EDIT_CONFIRM",what:confirm==="new"?null:"new"}),"another window on the desktop, from a template"):html("span",{style:edDim},MAX_WINDOWS+" windows (the most)"),base.windows.length<MAX_WINDOWS?chip("duplicate this window",false,()=>addWindow(base,dw,Object.assign({},dw,{title:cleanTitle(nameOf(dw)+" copy")}),dispatch),"a copy of this window, beside it"):null,base.windows.length>1?chip("remove this window",confirm==="delete",()=>dispatch({type:"EDIT_CONFIRM",what:confirm==="delete"?null:"delete"}),"close and forget this window"):null),"up to "+MAX_WINDOWS+" windows, each with its own size and content"),confirm==="new"?html("div",{"data-pw-edmenu":"new"},TEMPLATES.map(t=>html("div",{key:"tpl:"+t.key,className:edLine,style:{marginTop:2}},chip(t.label,false,()=>{dispatch({type:"EDIT_CONFIRM",what:null});addWindow(base,dw,fromTemplate(t),dispatch);if(t.news&&!newsOn(state))savePref("news",true,dispatch);},t.tip,"tpl:"+t.key),html("span",{style:edNote},t.desc)))):null,confirm==="delete"&&base.windows.length>1?html("div",{className:edLine},html("span",{style:{color:C.down,minWidth:0}},"remove “"+nameOf(dw)+"”?"),chip("yes, remove it",false,()=>put({windows:others}),undefined,"del:yes"),chip("no",false,()=>dispatch({type:"EDIT_CONFIRM",what:null}),undefined,"del:no")):null,wrow("reset this window reset all windows standard",html("div",{key:"winreset",className:edLine},confirm==="resetwin"?html("span",{style:{color:C.down,minWidth:0}},"this window back to the standard size, zoom and content?"):null,confirm==="resetwin"?[chip("yes, reset it",false,()=>{dispatch({type:"EDIT_CONFIRM",what:null});setWin({w:undefined,h:undefined,zoom:undefined,items:undefined,prio:undefined,side:undefined,compact:undefined,carousel:undefined,news:undefined});},undefined,"rw:yes"),chip("no",false,()=>dispatch({type:"EDIT_CONFIRM",what:null}),undefined,"rw:no")]:chip("reset this window",false,()=>dispatch({type:"EDIT_CONFIRM",what:"resetwin"}),"the standard size, zoom and content; it keeps its name and place"),confirm==="reset"?html("span",{style:{color:C.down,minWidth:0}},"one window, default spot, size and zoom, everything shown?"):null,confirm==="reset"?[chip("yes, reset all",false,()=>resetAllDisplay(dispatch),undefined,"reset:yes"),chip("no",false,()=>dispatch({type:"EDIT_CONFIRM",what:null}),undefined,"reset:no")]:chip("reset all windows",false,()=>dispatch({type:"EDIT_CONFIRM",what:"reset"}),"back to the standard look: one window, everything shown, the default spot, size and zoom"))));// ---- what it shows: a tick per feature, chips for the range tabs and the
// modes; with "arrange" on: priority / order / column / "move to another window"
const toggle=fid=>()=>{const on=!set[fid];setWin({items:toggleItem(dw,fid,on)});if(on&&fid==="panel.news"&&!newsOn(state))savePref("news",true,dispatch);};const chipRow=(label,ids,depth)=>html("div",{key:"chips:"+label,className:edLine,style:{width:"100%",paddingLeft:depth*10,boxSizing:"border-box"}},html("span",{style:edDim},label),ids.filter(fid=>matches(label,FEATURE_BY[fid].label,FEATURE_BY[fid].tip,fid)).map(fid=>chip(FEATURE_BY[fid].label,set[fid]===true,toggle(fid),FEATURE_BY[fid].tip+(set[fid]?" — shown, click to hide":" — hidden, click to show"),fid)));const featureRow=f=>{const fid=f.id,inIt=set[fid]===true,live=enabled(dw,fid);const parentOn=!f.parent||enabled(dw,f.parent);const note=!live?"":L&&L.folded.indexOf(fid)>=0?"(hidden — window too short)":has&&has[fid]===false&&fid==="panel.currencies"?"(everything is in one currency)":has&&has[fid]===false&&fid==="header.goal"?"(set one under Portfolio → a goal to reach)":has&&has[fid]===false&&fid!=="panel.news"?"(no data yet)":"";const prio=adv&&live&&f.p?dw.prio&&dw.prio[fid]||f.p:null;const panelCtl=adv&&live&&f.kind==="panel";const movable=adv&&inIt&&!f.parent&&f.kind!=="cell"&&others.length>0;return html("div",{key:fid,className:edLine,"data-pw-feature":fid,style:{width:half?"50%":"100%",boxSizing:"border-box",paddingLeft:depthOf(fid)*10,paddingRight:half?8:0,opacity:parentOn?1:0.5}},html("span",{style:edLabel,onClick:toggle(fid),title:(f.tip||f.label)+(inIt?" — shown, click to hide":" — hidden, click to show")},(inIt?"☑ ":"☐ ")+f.label),note?html("span",{style:edDim},note):null,fid==="panel.news"&&inIt?newsOn(state)?html("span",{style:edDim},"headlines on"):chip("headlines off · turn on",false,()=>savePref("news",true,dispatch),"headlines from Yahoo (Portfolio → headlines)","news:on"):null,prio?["always","normal","room"].map(p=>chip(PRIO_LABELS[p],prio===p,()=>setWin({prio:withChoice(dw.prio,fid,p,f.p)}),PRIO_TIPS[p],"prio:"+p,{prio:p})):null,inIt&&f.kind==="panel"&&!(FEATURE_BY[fid].car&&dw.carousel!=="stack")?chip("to top",false,()=>{const it=topPanel(dw,fid);if(it)setWin({items:it});},"show this first in its column","top",{ctl:"top"}):null,panelCtl?chip("↑",false,()=>{const it=shiftPanel(dw,fid,-1);if(it)setWin({items:it});},"earlier","up",{ctl:"up"}):null,panelCtl?chip("↓",false,()=>{const it=shiftPanel(dw,fid,1);if(it)setWin({items:it});},"later","down",{ctl:"down"}):null,panelCtl?chip(edSideOf(dw,fid)==="a"?"left column":"right column",false,()=>setWin({side:withChoice(dw.side,fid,edSideOf(dw,fid)==="a"?"b":"a",f.side)}),"now in the "+(edSideOf(dw,fid)==="a"?"left":"right")+" column — click to move it to the other","side",{ctl:"side"}):null,movable?chip("move to another window ▾",confirm==="move:"+fid,()=>dispatch({type:"EDIT_CONFIRM",what:confirm==="move:"+fid?null:"move:"+fid}),"take it out of this window and into another","move",{ctl:"move"}):null,movable&&confirm==="move:"+fid?others.map(w=>chip("→ "+nameOf(w),false,()=>{dispatch({type:"EDIT_CONFIRM",what:null});put(moveFeature(base,id,w.id,fid));},undefined,"to:"+w.id)):null);};// ---- the news page's options (13.1, windows[i].news): chips per field,
// saved at once; the first click creates `news: {}` (the new path)
const newsEditorNode=()=>{const raw=dw.news&&typeof dw.news==="object"&&!Array.isArray(dw.news)?normNews(dw.news):null;const cfg=Object.assign({},NEWS_DEF,raw);const setNews=patch=>setWin({news:normNews(Object.assign({},cfg,patch))||{}});const pad=(depthOf("panel.news")+1)*10;// (13.6: the ⚙ search finds a row by its label or NEWS_OPT_WORDS)
const row=(label,body,key)=>!matches(label,NEWS_OPT_WORDS[key])?null:html("div",{key:"news:"+key,className:edLine,style:{width:"100%",boxSizing:"border-box",paddingLeft:pad},"data-pw-ednews":key},html("span",{style:edDim},label),body);const pick=(label,field,v,tip)=>chip(label,cfg[field]===v,()=>{const p={};p[field]=v;setNews(p);},tip,field+":"+v);const flag=(label,field,tip)=>chip(label,cfg[field]===true,()=>{const p={};p[field]=!cfg[field];setNews(p);},tip,"flag:"+field);const failed=d.news&&Array.isArray(d.news.failed)?d.news.failed:[];const commitPick=ev=>{const words=String(ev.target.value||"").split(/[\s,]+/).filter(x=>x);const ok=newsList(words)||[],bad=words.filter(x=>!NEWS_TICKER_RE.test(x.toUpperCase()));if(ok.join(" ")!==cfg.tickers.join(" "))setNews({tickers:ok});ev.target.value=ok.join(" ");if(bad.length){dispatch({type:"NEWS_PICK_MSG",msg:"not a ticker: "+bad.join(", ")});setTimeout(()=>dispatch({type:"NEWS_PICK_MSG",msg:null}),5000);}};const full=cfg.tickers.length>=NEWS_LIST_MAX;const kids=[row("whose",[pick("movers","scope","movers","holdings moving > 3 % today (as before 13.1)"),pick("holdings","scope","holdings","every held stock"),pick("watchlist","scope","watch","the watchlist"),pick("both","scope","all","holdings and the watchlist"),pick("pick…","scope","pick","tickers you type (held or not)")],"scope"),cfg.scope==="pick"?row("tickers",[html("input",{key:"pick:"+cfg.tickers.join(" "),className:inputCss,disabled:full,style:{flex:"1 1 120px",minWidth:0,fontSize:9,padding:"1px 4px",opacity:full?0.6:1},defaultValue:full?"":cfg.tickers.join(" "),placeholder:full?NEWS_LIST_MAX+" picked (the most)":"KO MSFT SHOP.TO",title:"tickers to follow here (Enter or click away keeps them, Esc reverts)",onKeyDown:ev=>{if(isEnter(ev))commitPick(ev);else if(isEscape(ev)){ev.stopPropagation();ev.target.value=cfg.tickers.join(" ");ev.target.blur();}},onBlur:commitPick}),state.newsPickMsg?html("span",{key:"bad",style:{color:C.amber,whiteSpace:"nowrap"}},state.newsPickMsg):null],"pick"):null,cfg.scope==="pick"&&cfg.tickers.length?row("picked",cfg.tickers.map(t=>chip(t+(failed.indexOf(t)>=0?" ?":"")+" ×",false,()=>setNews({tickers:cfg.tickers.filter(x=>x!==t)}),failed.indexOf(t)>=0?t+": headlines unavailable (Yahoo) — click to remove":"click to remove "+t,"pk:"+t)),"picked"):null,row("per stock",[1,3,5,10].map(n=>pick(String(n),"per",n,"headlines kept per ticker (Yahoo gives ~10)")),"per"),row("order",[pick("newest","sort","new","newest first"),pick("movers","sort","move","the biggest movers first (the stock open here first)"),pick("A–Z","sort","ticker","by ticker")],"sort"),row("since",[pick("today","span","day","the last 24 hours"),pick("3 days","span","3d","the last 3 days"),pick("week","span","week","the last 7 days"),pick("all","span","all","any time")],"span"),row("layout",[flag("dense","dense","one line per story"),flag("group by ticker","group","a heading per ticker"),flag("source","sources","show the source and the time")],"layout"),row("market news",NEWS_FEED_IDS.map(f=>chip(NEWS_FEEDS[f],cfg.market.indexOf(f)>=0,()=>setNews({market:cfg.market.indexOf(f)>=0?cfg.market.filter(x=>x!==f):cfg.market.concat([f])}),"the latest headlines from "+NEWS_FEEDS[f]+" (its public feed, fetched every 15 minutes) mixed into this page","mk:"+f)),"market"),cfg.mute.length?row("muted",cfg.mute.map(t=>chip(t+" ×",false,()=>setNews({mute:cfg.mute.filter(x=>x!==t)}),"show "+t+" again","mu:"+t)).concat([chip("unmute all",false,()=>setNews({mute:[]}),"show every ticker again","mu:all")]),"mute"):null,cfg.q?row("keyword",[chip("keyword: "+cfg.q+" ×",false,()=>setNews({q:""}),"the saved filter (typed in the panel's filter box) — click to clear","q")],"q"):null];// 13.6: while searching, only the matching option rows; none → no block at all
if(q&&!kids.some(k=>k))return null;return html("div",{key:"news:opts","data-pw-feature":"panel.news",style:{width:"100%",boxSizing:"border-box"}},kids);};// does the search word name a news option (NEWS_OPT_WORDS)?
const newsOptHit=!!q&&Object.keys(NEWS_OPT_WORDS).some(k=>NEWS_OPT_WORDS[k].indexOf(q)>=0);const featureBody=key=>()=>{const out=[];FEATURES.forEach(f=>{if(editGroupOf(f.id)!==key||/^graph\.(range|mode)\./.test(f.id))return;const ranges=f.id==="graph.tabs"?FEATURES.filter(g=>g.parent==="graph.tabs"&&/^graph\.range\./.test(g.id)).map(g=>g.id):[];const modes=f.id==="graph.modes"?["graph.mode.value","graph.mode.pl","graph.mode.sectors"]:[];const sub=ranges.concat(modes).some(fid=>matches(FEATURE_BY[fid].label,FEATURE_BY[fid].tip,fid));// 13.6: the search also finds the news options (shown under a ticked news row;
// with news off, a one-line hint says to tick it first)
const newsOpts=f.id==="panel.news"&&set["panel.news"]===true?newsEditorNode():null;const newsHit=f.id==="panel.news"&&set["panel.news"]!==true&&newsOptHit;if(!matches(f.label,f.tip,f.id)&&!sub&&!newsOpts&&!newsHit)return;// the search box (13.4)
out.push(featureRow(f));if(newsOpts)out.push(newsOpts);else if(newsHit)out.push(html("div",{key:"news:off",className:edHint,"data-pw-ednews":"off"},"tick news to choose what it shows (whose news, how many per stock, since when, market news\u2026)"));if(ranges.length&&(sub||!q))out.push(chipRow("ranges",ranges,2));if(modes.length&&(sub||!q))out.push(chipRow("modes",modes,3));});return html("div",{style:{display:"flex",flexWrap:"wrap",alignItems:"baseline"}},out);};// the head says how many are unticked, only when some are
const countOff=key=>FEATURES.filter(f=>editGroupOf(f.id)===key&&!set[f.id]).length;const groupLabel=g=>g[1]+(countOff(g[0])?" · "+countOff(g[0])+" off":"");const pfHead="Portfolio · "+(d.currency||"auto")+" · "+HISTORY_LABELS[btNow];// while searching: does any feature row match (the "What it shows" caption), does anything at all
const newsAny=newsOptHit&&(set["panel.news"]!==true||newsEditorNode()!==null);const anyFeature=!q||newsAny||FEATURES.some(f=>matches(f.label,f.tip,f.id));const winHead="This window"+(base.windows.length>1?" · "+base.windows.length+" open":"")+" · "+G.Wu+" × "+(isNumber(G.Hu)?G.Hu:"fit");// the two settings groups, built once: while searching, group() runs every body and
// gives null when no row in it matches, so "nothing matches" shows exactly when nothing renders
const pfNode=group("portfolio",pfHead,portfolioBody,"the whole portfolio's settings — shared by every window");const winNode=group("window",winHead,winBody,"this window's name, place and size");const anyMatch=!q||anyFeature||pfNode!==null||winNode!==null;// 13.6: the "undo" chip (3 min after a change) and the note after an undo (8 s);
// the editor re-renders every data tick, so both go on their own
const undoNow=Date.now();const undoU=undoFresh(state.settingUndo||null,undoNow);const undoWide=G.Wu-LAYOUT_K.PAD_X>=LAYOUT_K.UNDO_FULL_W;const undoN=state.undoNote&&typeof state.undoNote.at==="number"&&undoNow-state.undoNote.at<UNDO_NOTE_MS?state.undoNote:null;// (in a narrow window the chip gets a line of its own under the header, so "⚙ Settings" keeps its room)
const undoChip=undoU?html("span",{key:"undo",className:edChip,style:{flex:"0 1 auto",minWidth:0,maxWidth:LAYOUT_K.UNDO_CHIP,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},"data-pw-edundo":undoU.busy?"busy":"1","data-pw-undo-key":undoU.key,title:"put "+undoU.label+" back the way it was before your last change",onClick:()=>undoSetting(state,dispatch)},undoU.busy?"undoing…":undoWide?"undo: "+undoU.label:"undo"):null;return html("div",{className:edBox,"data-pw-editor":id},html("div",{className:rowFlex,style:{alignItems:"baseline",columnGap:6}},html("span",{style:Object.assign({flex:"1 1 auto",color:C.ink,display:"flex",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},edLabel),title:"settings: the portfolio, this window ("+nameOf(dw)+") and what it shows"},html("span",{style:{flex:"none"}},"\u2699 Settings"),edNarrow?null:html("span",{"data-pw-edtitle-name":"1",style:{whiteSpace:"pre",overflow:"hidden",textOverflow:"ellipsis",minWidth:0}}," · "+nameOf(dw))),undoU&&!edNarrow?undoChip:null,html("input",{className:inputCss,style:{width:96,fontSize:9,padding:"1px 5px",flex:"none"},placeholder:"find a setting\u2026",value:state.editQuery||"","data-pw-edfind":"1",title:"type a word \u2014 currency, zoom, news, dividends\u2026 \u2014 to see only the matching settings",onChange:ev=>dispatch({type:"EDIT_QUERY",value:ev.target.value})}),q?chip("×",false,()=>dispatch({type:"EDIT_QUERY",value:""}),"show every setting again","find:clear",{ctl:"findclear"}):null,chip(hints?"hide hints":"show hints",false,()=>dispatch({type:"EDIT_HINTS",on:!hints}),"the one-line explanations under each section","hints",{hints:hints?"1":"0"}),html("span",{className:edChip,style:{fontSize:10},title:"close (Esc)","data-pw-edclose":"1",onClick:()=>dispatch({type:"CLOSE_EDITOR"})},"\xD7")),undoU&&edNarrow?html("div",{className:edLine,"data-pw-edundo-line":"1"},undoChip):null,undoN?html("div",{className:edLine,"data-pw-edundo-msg":"1","data-pw-tone":undoN.err?"warn":"ok"},html("span",{style:undoN.err?edMsg:edOk},undoN.text)):null,q&&!anyMatch?html("div",{className:edHint,"data-pw-edfind-none":"1"},"nothing matches “"+q+"” — try currency, zoom, graph, news, since, muted, alerts, dividends"):null,pfNode,winNode,!anyFeature?null:html("div",{className:edCaption},html("span",{style:{flex:"1 1 auto",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},title:"tick what this window shows"},"What it shows"),chip(adv?"arrange ▾":"arrange ▸",adv,()=>dispatch({type:"EDIT_ADVANCED",on:!adv}),"order, columns, what hides first, move to another window","adv",{adv:adv?"1":"0"})),hints&&anyFeature&&!q?html("div",{className:edHint},adv?EDIT_HINTS.arrange:EDIT_HINTS.arrangeOff):null,EDIT_FEATURE_GROUPS.map(g=>group(g[0],groupLabel(g),featureBody(g[0]),EDIT_HEAD_TIPS[g[0]])));};const winTitle=(state,d)=>state._win&&state._win.title||uiPrefs(state).title||d.name||"portfolio";const compactRow=(state,dispatch,d,env)=>{const totals=d.totals||{};const dc=isFin(totals.dayChange)?totals.dayChange:0;// at the window's width: the sparkline narrows, then goes; then the money change
const K=LAYOUT_K,G=state._geo||winGeom(state);const cw=(winTitle(state,d).length+2)*K.EYE_CH+K.MONO*(13*money(totals.value).length+11*(pct(totals.dayChangePct).length+signedMoney(totals.dayChange).length))+3*K.COL_GAP;const L=layoutFor(G.win,{Wu:G.Wu,Hu:G.Hu,compact:true,compactW:cw});return html("div",{className:rowFlex,style:{alignItems:"center"}},html("span",{className:eyebrow,style:{cursor:"pointer"},title:"click: show everything \xB7 drag to move",onClick:titleClick(state,dispatch)},winTitle(state,d),"\xA0",html("span",{style:{color:d.session==="open"?C.up:d.session==="pre"||d.session==="after"?C.amber:C.dim}},"\u25CF")),html("span",{className:mono,style:{display:"flex",alignItems:"center",columnGap:8,fontSize:11,whiteSpace:"nowrap"}},env.lastFetchFailed?html("span",{style:{color:C.down,fontWeight:600},title:plainError(env.errorText).text+(env.errorText?"\n\n"+env.errorText:"")},"!"):null,html("span",{style:{fontSize:13}},money(totals.value)),html("span",{style:{color:upDown(dc)},title:"today's change"},pct(totals.dayChangePct)),L.compactMoney?html("span",{style:{color:upDown(dc)}},signedMoney(totals.dayChange)):null,L.compactSpark?html(Spark,{values:compactSpark(d),w:L.compactSpark}):null,gearNode(state,dispatch,{position:"absolute",right:5,top:10,fontSize:9})));};// ------------------------------------------------------------------ render
// one window: `state` is its view (renderWindow), `dispatch` tags events with its id
const renderWin=(state,dispatch)=>{const hover={onMouseEnter:()=>dispatch({type:"HOVER",on:true}),onMouseLeave:()=>dispatch({type:"HOVER",on:false})};const env=state.raw;if(!env){return frame(state,dispatch,html("span",{className:eyebrow},"portfolio"),html("div",null,html("div",{className:(0,_uebersicht.css)(_templateObject147(),C.dim)},state.parseError?"the widget command failed:":"starting…"),state.parseError?html("div",{className:(0,_uebersicht.css)(_templateObject148(),C.down)},state.parseError):null));}const d=env.data;if(!d){const setup=env.status==="setup";return frame(state,dispatch,html("span",{className:eyebrow},setup?"portfolio · one-time setup":"portfolio"),html("div",null,env.status==="loading"?html("div",null,html("div",{className:(0,_uebersicht.css)(_templateObject149(),C.dim)},"fetching prices for the first time\u2026"),html(LoadingLine,{progress:env.progress})):setup?setupCard(state,dispatch,env):errorCard(state,dispatch,env)));}setCurrency(d.currency);const totals=d.totals||{};if(compactOf(state)){return frame(state,dispatch,compactRow(state,dispatch,d,env),state.editOpen?html("div",null,editorNode(state,dispatch,d,null,null)):html("div",null),hover);}// ---- what this window has switched on (12.12 FEATURES; the 12.11 window has
// all of 12.11's). A feature that is off is gone and its work skipped; a
// current choice whose control is off falls back to one that is on (range,
// graph mode, holdings view, sort, the add form, the expanded map).
const fwin=state._win||null;const inItems=id=>itemSetOf(itemsOf(fwin))[id]===true;const en=id=>enabled(fwin,id);const gWant=en("graph");// off: no series / index / sector / backtest work
const btOn=en("graph.backtest");// off: no 3Y–MAX tabs, no simulated points
const modesOn=inItems("graph.modes")?["value","pl","sectors"].filter(m=>inItems("graph.mode."+m)):[];const viewsOn=["list","map","watch"].filter(v=>en("holdings."+v));const addOn=en("holdings.add"),bellOn=en("row.bell"),dotOn=en("row.news");const eff={};if(modesOn.indexOf(state.graphMode)<0)eff.graphMode=modesOn[0]||"value";if(viewsOn.length&&viewsOn.indexOf(state.view)<0)eff.view=viewsOn[0];if(state.mapExpanded&&viewsOn.indexOf("map")<0)eff.mapExpanded=false;if(state.showAdd&&!addOn)eff.showAdd=false;if(state.sort!=="az"&&!en("holdings.sort"))eff.sort="az";if(state.mark&&state.mark.sim&&!btOn)eff.mark=null;// a simulated moment needs the backtest part
if(Object.keys(eff).length)state=Object.assign({},state,eff);const dayRows=dayRowsOf(d,state);// d.daily plus any older rows loaded on demand
// "from here": the graph starts at a moment you picked. The points come from
// the shortest standard range that reaches back that far (so a start last
// week keeps hourly detail), cut at that moment.
const from=gWant&&state.from&&!(state.from.sim&&!btOn)?state.from:null;const bt=btOf(d);const btTabs=btOn?btTabsOf(d):[];btModeNow=state.btMode==="weighted"?"weighted":"held";btModeBy[dispatch.w||""]=btModeNow;// the range tabs this window shows (RANGES, the backtest years, ALL)
const rangeTabs=RANGES.concat(btTabs.map(tb=>tb.key),["ALL"]).filter(r=>inItems("graph.range."+r));// a backtest tab this data doesn't have (older data, a smaller backtestYears) shows as ALL;
// a range whose tab is off: the first tab shown, else 1D
let effRange=btOn&&BT_RANGES.indexOf(state.range)>=0&&!btTab(d,state.range)?"ALL":state.range;if(rangeTabs.indexOf(effRange)<0)effRange=rangeTabs[0]||"1D";const baseRange0=from?pickRange(from.t,d):effRange;const baseRange=!btOn&&BT_RANGES.indexOf(baseRange0)>=0?"ALL":baseRange0;const btRange=btOn&&BT_RANGES.indexOf(baseRange)>=0?btTab(d,baseRange):null;// the index to compare with (12.10): the choice (this session's pick, else
// data.ui.benchmark; null with older data) and the one the data carries.
// Until they agree the caption says "loading SPY…" and no index line shows
// (the old index's line under the new name would mislead); "none" shows none.
const benchWant=benchWantOf(state,d);const dBench=d.benchmark&&typeof d.benchmark==="object"?d.benchmark:null;const benchWantSym=benchWant==="auto"?benchDefault(d.currency):benchWant==="none"?null:benchWant;const benchLoading=!!benchWantSym&&(dBench?dBench.symbol!==benchWantSym||benchWant==="auto"&&dBench.source!=="default":benchWant!=="auto"||state.benchWant==="auto");// auto without data: only right after the pick
const benchNoData=!!benchWantSym&&!benchLoading&&!!dBench&&!!dBench.error;// the benchmark's level at each point: d.benchmark.idx[R] runs alongside d.history[R]
const benchOn=gWant&&en("graph.bench");// off: no index line or caption work
const bench=benchOn&&benchWant!=="none"&&!benchLoading&&dBench&&!dBench.error&&dBench.idx&&typeof dBench.idx==="object"?dBench:null;const historyOf=r=>{const pts=d.history&&d.history[r]||[];const idx=bench&&Array.isArray(bench.idx[r])&&bench.idx[r].length===pts.length?bench.idx[r]:null;return idx?withBench(pts,idx):pts;};const dayPt=r=>({t:r[1],v:r[2],approx:!!r[3],bi:typeof r[4]==="number"?r[4]:null,b:typeof r[5]==="number"?r[5]:null});let rawSeries=gWant?historyOf(btRange?"ALL":baseRange):[];let olderComing=false;if(!gWant){// the graph is off in this window: none of its work (no older days loaded either)
}else if(btRange){// a backtest tab: the real part like a long custom span (one point per
// day from the first real day or the tab's start, ending on the live
// value), and before the first purchase the simulated points, which end
// at the first real day
const startT=from?from.t:btRange.start;const realT=Math.max(startT,bt.anchor.t);const live=rawSeries.length?rawSeries[rawSeries.length-1]:null;let real=rawSeries.filter(p=>p.t>=realT-1);if(dayRows.length){olderComing=ensureDaysBack(d,state,dayRows,realT,dispatch);// until older day rows arrive (or if loading them failed), the ALL
// points fill the stretch before them, so no simulated-looking line
// bridges real days
const head=real.filter(p=>p.t<dayRows[0][1]-1);real=head.concat(thinRows(dayRows.filter(r=>r[1]>=realT-1),MAX_GRAPH_PTS).map(dayPt));if(live&&(!real.length||live.t>real[real.length-1].t))real.push(live);}const sim=startT<bt.anchor.t-1?simPoints(d,btRange.key,btModeNow).filter(p=>p.t>=startT-1):[];rawSeries=sim.concat(real);}else if(from&&(baseRange==="1Y"||baseRange==="ALL")&&dayRows.length){// a long custom span: one point per day straight from the day-by-day
// table (finer than the thinned-out 1Y/ALL series, and the same numbers
// the days panel shows), ending on the live value. A start before the
// rows on hand loads the older ones (the graph fills in when they land).
olderComing=ensureDaysBack(d,state,dayRows,from.t,dispatch);const live=rawSeries.length?rawSeries[rawSeries.length-1]:null;rawSeries=thinRows(dayRows.filter(r=>r[1]>=from.t-1),MAX_GRAPH_PTS).map(dayPt);if(live&&(!rawSeries.length||live.t>rawSeries[rawSeries.length-1].t))rawSeries.push(live);}else if(from){rawSeries=rawSeries.filter(p=>p.t>=from.t-1);}if(from){// a picked day brings that day's own value: make it the first point
if(from.v!==undefined&&from.v!==null&&(!rawSeries.length||rawSeries[0].t-from.t>60)){rawSeries=[{t:from.t,v:from.v,approx:!!from.approx,sim:!!from.sim,bi:typeof from.bi==="number"?from.bi:null,b:!from.sim&&typeof from.b==="number"?from.b:null}].concat(rawSeries);}}// Money at work over time (cost basis + cash): what the P&L graph subtracts,
// and what tells a deposit from a gain in "change over the range".
const steps=d.basisSteps&&d.basisSteps.length?d.basisSteps:null;const stepBase=t=>{let b=0;for(let i=0;i<steps.length&&steps[i][0]<=t;i++)b=steps[i][1];return b;};const baseOf=steps?p=>p.b!==undefined&&p.b!==null?p.b:stepBase(p.t):null;// simulated points carry the money at work on the first real day: no flow
// is seen before or at the join, so p&l and "change" count only real buys
if(steps&&bt&&rawSeries.some(p=>p.sim)){const b0=stepBase(bt.anchor.t);rawSeries=rawSeries.map(p=>p.sim?Object.assign({},p,{b:b0}):p);}const legacyBase=totals.invested||totals.costBasis||null;// cached data from before 12.2
const baseNow=steps?steps[steps.length-1][1]:null;const vsInvested=!!(state.plMode==="invested"&&totals.invested&&baseNow);const kBase=vsInvested?totals.invested/baseNow:1;const plOf=p=>baseOf?p.v-baseOf(p)*kBase:p.v-legacyBase;const plGraph=state.graphMode==="pl"&&!!(baseOf||legacyBase);const sectorMode=state.graphMode==="sectors";// sector series are "% since the start of the range": cut at the custom
// start and re-base every series to 0% there
const cutSectors=(sd,t)=>{if(!sd||!sd.t)return sd;// the first bar of the chosen day (a daily close is stamped 16:00), else
// the first bar after it: never a bar from an earlier day
const dayStart=t-20*3600;let s0=0;while(s0<sd.t.length-1&&sd.t[s0]<dayStart)s0++;const rebase=ser=>{const p0=ser[s0];return ser.slice(s0).map(v=>v===null||v===undefined||p0===null||p0===undefined?null:Math.round(((1+v/100)/(1+p0/100)-1)*10000)/100);};return{t:sd.t.slice(s0),total:rebase(sd.total||[]),themes:(sd.themes||[]).map(th=>({name:th.name,pct:rebase(th.pct)}))};};const sectorFull=gWant&&d.sectors?d.sectors[baseRange]:null;const sectorData=from?cutSectors(sectorFull,from.t):sectorFull;const focusName=sectorMode&&state.sectorFocus&&sectorSeriesOf(sectorData,state.sectorFocus)?state.sectorFocus:null;const rangeWords=from?"since "+fmtDayY(from.t):btRange?btRange.key==="MAX"||btRange.short?"since "+fmtDayY(btRange.start):"over "+BT_YEARS[btRange.key]+" years":{"1H":"over the last hour","1D":"today","1W":"over the past week","1M":"over the past month","1Y":"over the past year","ALL":"since the start"}[effRange];const series=plGraph?rawSeries.map(p=>Object.assign({},p,{v:plOf(p)})):rawSeries;// gain between two value points with deposits / new buys taken out (simple Dietz)
const perf=(a,b)=>{const flow=baseOf?baseOf(b)-baseOf(a):0;const gain=b.v-a.v-flow;const denom=a.v+flow/2;return{gain:gain,flow:flow,pct:denom>0?gain/denom*100:null};};const lastRaw=rawSeries.length?rawSeries[rawSeries.length-1]:null;const simShown=!sectorMode&&rawSeries.some(p=>p.sim);// With a simulated stretch the span can be decades and start from a tiny
// scaled value, where simple Dietz lets one later purchase swamp the result
// (a 1962 start read +680% instead of the holdings' real growth). There the
// % is time-weighted: each step's growth with new money taken out, chained.
const timeWeighted=pts=>{let g=1;for(let i=1;i<pts.length;i++){const flow=baseOf?baseOf(pts[i])-baseOf(pts[i-1]):0;if(pts[i-1].v>0)g*=(pts[i].v-flow)/pts[i-1].v;}return(g-1)*100;};let rangePerf=rawSeries.length>1?perf(rawSeries[0],lastRaw):null;if(rangePerf&&simShown)rangePerf=Object.assign({},rangePerf,{pct:timeWeighted(rawSeries),twr:true});const kHeld=bt&&bt.k&&typeof bt.k.held==="number"&&bt.k.held>0?bt.k.held:null;const simTip=p=>(btModeNow==="held"?"today's share counts at that day's prices"+(kHeld?" (worth "+money(p.v/kHeld)+")":"")+", scaled to meet your real value on the day you bought":"today's weights (each holding's share of today's value), rebalanced monthly, scaled to meet your real value on the day you bought")+"\nsimulated: hindsight flatters this — these are the stocks you ended up choosing";// the benchmark (value graph only): the same money put into the index on
// the same days as each purchase. Its units start at the first point with an
// index level; every later flow (new money in, or a sale / cash taken out)
// buys or sells units: the same flows as the portfolio line (baseOf). The
// tracker gives rebuilt points (and day rows) their recorded neighbours'
// offset from basisSteps (12.7), so a rebuilt/recorded seam is no longer
// read as money in then out again. (Simulated points carry the money at
// work on the first real day, so no flow before the join.)
const benchBase=baseOf;let benchLine=null,benchCap=null;// hidden with "hide" under the graph (saved as _settings.showBenchmark):
// "show index" brings it back. "index: SPY ▾" opens the picker (with data
// that carries ui.benchmark: 12.10+); _settings.benchmark "none" leaves
// only "index: none ▾", so another can be picked
const benchCtx=benchOn&&!plGraph&&!sectorMode&&rawSeries.length>1;let benchOff=benchCtx&&!showBenchOf(state)&&!!(bench||benchLoading||benchNoData);let benchCtl=benchCtx&&!benchOff&&benchWant!==null&&en("graph.benchPicker");if(state.benchPick&&!benchCtl)benchCloseLater(dispatch);// p&l / sectors / no series: it closes
let benchNote=!benchCtx||benchOff?null:benchLoading?"loading "+benchWantSym+"…":benchNoData?"no data for "+benchWantSym+" on Yahoo":null;if(bench&&!benchOff&&!plGraph&&!sectorMode&&rawSeries.length>1){const P=rawSeries;const okBi=x=>typeof x==="number"&&isFinite(x)&&x>0;let j0=-1;for(let i=0;i<P.length&&j0<0;i++)if(okBi(P[i].bi))j0=i;if(j0>=0){const B=P.map(()=>null);let units=P[j0].v/P[j0].bi,pending=0,k=j0;B[j0]=P[j0].v;// daily graphs skip days: a purchase between two points buys at its own
// day's close (bench.steps, aligned with basisSteps; 12.6+), not the next point's
const bSteps=steps&&["1H","1D","1W","1M"].indexOf(baseRange)<0&&Array.isArray(bench.steps)&&bench.steps.length===steps.length?bench.steps:null;for(let i=j0+1;i<P.length;i++){let flow=benchBase?benchBase(P[i])-benchBase(P[i-1]):0;if(bSteps&&flow){let sum=0,known=0,u=0;for(let s=1;s<steps.length;s++){if(steps[s][0]<=P[i-1].t||steps[s][0]>P[i].t)continue;const f=steps[s][1]-steps[s-1][1];sum+=f;if(okBi(bSteps[s])){known+=f;u+=f/bSteps[s];}}if(Math.abs(sum-flow)<0.01){units+=u;flow-=known;}// else: the next point, as before
}pending+=flow;if(okBi(P[i].bi)){units+=pending/P[i].bi;pending=0;B[i]=units*P[i].bi;k=i;}}if(k>j0){benchLine=B;const you=perf(P[j0],P[k]);// the index's own money in (the same basisSteps flows its line used)
const bFlow=benchBase?benchBase(P[k])-benchBase(P[j0]):0;const bDen=B[j0]+bFlow/2;const bPct=bDen>0?(B[k]-B[j0]-bFlow)/bDen*100:null;if(you.pct!==null&&bPct!==null){const r1=x=>Math.round(x*10)/10;const f1=x=>(x>=0?"+":"−")+Math.abs(x).toFixed(1)+"%";const a=r1(you.pct),b=r1(bPct),diff=r1(a-b);const sym=String(bench.symbol||"index");benchCap={// both figures cover the same span: say so up front when the
// index starts later than the graph
lead:(j0>0?"since "+fmtDayY(P[j0].t)+": ":"")+"you "+f1(a)+" · "+sym+" "+f1(b)+" · ",// a narrow window with the "index: X ▾" picker on the same line:
// the symbol is already there, so the lead leaves it out
leadShort:(j0>0?"since "+fmtDayY(P[j0].t)+": ":"")+"you "+f1(a)+" · index "+f1(b)+" · ",verdict:diff>0?"beat by "+diff.toFixed(1)+" pts":diff<0?"behind by "+Math.abs(diff).toFixed(1)+" pts":"even with "+sym,// a narrow window (< 400 px): the symbol is in the lead or the picker, so just the gap
short:diff===0?"even":(diff>0?"+":"−")+Math.abs(diff).toFixed(1)+" pts",diff:diff};}}}}// the point under the crosshair (hover wins over the pinned mark)
const hovering=state.hoverT!==null;const markT=state.mark?state.mark.t:null;const activeT=hovering?state.hoverT:markT;let readout=null;if(!sectorMode&&!hovering&&state.mark&&state.mark.d){readout=state.mark;// a picked day carries its own value…
if(state.mark.sim){// …a simulated one follows the mode shown
const p=rawSeries.length?rawSeries[nearestIdx(rawSeries.map(q=>q.t),state.mark.t)]:null;readout=Object.assign({},state.mark,p&&p.sim&&p.t===state.mark.t?{v:p.v,bi:p.bi}:{},steps&&bt?{b:stepBase(bt.anchor.t)}:{});}}else if(!sectorMode&&activeT!==null&&rawSeries.length&&activeT>=rawSeries[0].t-1&&activeT<=lastRaw.t+1){readout=rawSeries[nearestIdx(rawSeries.map(p=>p.t),activeT)];}const readoutPerf=readout&&lastRaw?perf(readout,lastRaw):null;const onHoverPt=t=>queueHover(dispatch,t);const onPickPt=t=>dispatch({type:"SET_MARK",mark:state.mark&&state.mark.t===t&&!state.mark.d?null:bt&&t<bt.anchor.t-1?{t:t,sim:true}:{t:t}});// the enlarge toggle: value and p&l only (sectors have their own enlarge)
const bigOn=inItems("graph.big")&&graphBigOf(state)&&!sectorMode;// With a "from …" or "start here" chip in the tab row the value readout no
// longer fits beside it, so it gets a line of its own (decided by state, not
// by the pointer, so hovering never makes the graph jump). Sector mode's
// readout is a short date and stays in the row.
const readoutOn=inItems("graph.readout");const readoutOwnLine=readoutOn&&!sectorMode&&!!(from||state.mark);// holdings whose prices begin after the shown range starts (their money
// counts as cash until then)
const shownStart=!sectorMode&&rawSeries.length?isoOf(rawSeries[0].t):null;// (d.lateStarts for the real part, d.backtest.lateStarts for the simulated one)
const lateAll=[];(Array.isArray(d.lateStarts)?d.lateStarts:[]).concat(bt&&Array.isArray(bt.lateStarts)?bt.lateStarts:[]).forEach(ls=>{if(ls&&!lateAll.some(o=>o.ticker===ls.ticker))lateAll.push(ls);});let lateShown=shownStart?lateAll.filter(ls=>ls&&typeof ls.first==="string"&&ls.first>shownStart):[];let histProg=env.historyProgress&&typeof env.historyProgress==="object"?env.historyProgress:null;const histCount=histProg&&isFinite(histProg.done)&&isFinite(histProg.total)&&histProg.total>0?" "+histProg.done+"/"+histProg.total:"";const positions=d.positions||[];const anyUndated=positions.some(p=>p.undated===true);const UNDATED_TIP="no purchase date — counted as held for the whole graph (backtestYears in _settings)";const empty=positions.length===0;const listRows=sortRows(positions,state.sort);const watchRows=d.watchlist||[];const look=lookOf(state,state.focusTicker);// this window's open stock (lookBy, 12.12)
const lookData=look.data;const focusHeld=state.focusTicker?positions.find(p=>p.ticker===state.focusTicker):null;const focusWatch=!focusHeld&&state.focusTicker?watchRows.find(w=>w.ticker===state.focusTicker):null;let focus=focusHeld||focusWatch||null;if(!focus&&state.focusTicker)focus=lookData?rowFromLook(lookData):{ticker:state.focusTicker,pending:true};if(focus&&!focus.name&&lookData&&lookData.name)focus=Object.assign({},focus,{name:lookData.name});const focusWatched=!!(focusWatch||lookData&&lookData.watched);const earnings=d.earnings||[];// all upcoming, soonest first (StockDetail looks up here)
const calendar=calendarOf(d);// earnings + announced ex-dividend dates, by date
const hasExDiv=calendar.some(e=>e.kind==="exdiv");const alerts=(d.alerts||[]).slice(-5).reverse();const hasPriceAlerts=!!(d.priceAlerts&&typeof d.priceAlerts==="object");// 12.9+ tracker
const tOn=targetsOn(d);// 12.10 target allocation; off = everything as before
const driftOn=tOn&&en("map.drift");const mapRange=state.mapRange==="DRIFT"&&!driftOn?"1D":state.mapRange;// a ticker's bell (price alerts) and news dot, as switched on (row.bell, row.news)
const rulesOn=tk=>bellOn?rulesFor(d,tk):[];const nOn=notesOn(d);// 13.6: the ✎ mark of a note / price target
const marksOf=tk=>rulesOn(tk).length>0||dotOn&&markNewsOf(d,tk).length>0||nOn&&!!noteOf(state,d,tk);const title=winTitle(state,d);const fxMain=d.fx&&d.fx.length?d.fx[0]:null;const sessionTip={open:"US market open",pre:"US pre-market (4:00–9:30 ET)",after:"US after-hours (16:00–20:00 ET)",closed:"US market closed"}[d.session]||"";// 12.7: realized gains and total return (absent in older data.json)
const hasRealized=isFin(totals.realized);// every recorded sale without a known gain: the tracker's 0 is no break-even
const unknownSales=isFin(d.salesUnknown)?d.salesUnknown:0;const realizedUnknown=hasRealized&&unknownSales>0&&isFin(d.salesCount)&&unknownSales>=d.salesCount;const showDiv=isFin(totals.annualDividends)&&totals.annualDividends>0;// no "div ~$0/yr"
const perfBlk=d.performance&&typeof d.performance==="object"?d.performance:null;// 12.8
const showTotalReturn=isFin(totals.totalReturn)&&(hasRealized||Array.isArray(d.sales)&&d.sales.length>0||isFin(totals.dividendsReceived)&&totals.dividendsReceived>0);// 12.8: with the total-return row shown, only its %/yr joins that row (one
// "total" in the header); otherwise its own row "+x% total · +y%/yr"
const perfOn=perfShown(perfBlk);const perfYr=perfOn&&isFin(perfBlk.xirrPct);const perfLeftOut=perfOn&&Array.isArray(perfBlk.twrLeftOut)?perfBlk.twrLeftOut.filter(t=>typeof t==="string"):[];const perfTip=!perfOn?"":"money-weighted since "+fmtIsoY(perfBlk.since)+": purchases (at each day's exchange rate) vs sales, dividends and today's value, cash left out"+(perfYr?" · "+pct1(perfBlk.totalPct)+" total, XIRR "+pct1(perfBlk.xirrPct)+"/yr":" · no annual rate found for these cash flows")+(isFin(perfBlk.twrPct)?"\ntime-weighted"+(typeof perfBlk.twrSince==="string"?" since "+fmtIsoY(perfBlk.twrSince):"")+": "+pct1(perfBlk.twrPct)+(isFin(perfBlk.twrAnnualPct)?" ("+pct1(perfBlk.twrAnnualPct)+"/yr)":"")+": the holdings' growth with new money taken out, cash left out"+(perfLeftOut.length?"; without "+perfLeftOut.join(", ")+" (sold, no prices)":""):"");// 13.6: the goal line's hover (always ends with "not a forecast")
const goalT=goalView(d);const goalNotForecast="This is simple arithmetic on your past return, not a forecast: markets go up and down, and past returns don't repeat.";const goalTip=!goalT||goalT.noRate?"":["Your goal: "+money(goalT.goal)+" by "+fmtIsoLong(goalT.g.date)+". You have "+money(goalT.now)+" now ("+goalT.pctNow+"%).",goalT.reached?"You have reached it.":goalT.passed?"The goal date has passed.":goalT.proj!==null?"If it keeps growing at your annual return so far ("+pct1(goalT.xirr)+" a year, money-weighted since "+fmtIsoY(goalT.since)+"), it would be about "+money(goalT.proj)+" by then — "+(goalT.onTrack?"enough.":goalT.shortPct+"% short.")+(goalT.need!==null&&!goalT.onTrack?" You would need about "+pct1(goalT.need)+" a year, or to put more money in.":""):goalT.why==="young"?"A projection appears after a year of history: a return measured over a few months jumps around too much to project.":"A projection appears once the widget knows your annual return (it needs dated purchases and 30 days of history).",(goalT.proj!==null?"Cash is counted as it is, without growth. ":"")+goalNotForecast].join("\n");// ---- the layout (12.12): what this window shows at its size, from ONE pure
// function (layoutFor). ctx: what is on (enabled and has something to show),
// text widths for the header lines and the tab row, and a height estimate
// per panel (est.*: LAYOUT_K rows; the carousel counts its tallest member).
const G=state._geo||winGeom(state);const win=G.win;const K=LAYOUT_K;// the news panel (12.12): the stock open here, then news.top (no work while it is off)
const newsCfg=enabled(win,"panel.news")?newsCfgOf(win):null;// 13.1: the news page's options (null = the 13.0 panel)
const newsQ=newsCfg?newsQueryOf(state,newsCfg):"";const feed=enabled(win,"panel.news")&&newsOn(state)?newsCfg?newsPageFeed(d,state,newsCfg):newsFeedOf(d,state):{rows:[],entries:[],busy:false};const newsEntries=newsCfg?feed.entries||[]:feed.rows;// the news page counts headings + stories as its rows
const newsRowH=newsCfg&&newsCfg.dense?K.ROW_NEWS_DENSE:K.ROW_NEWS;const newsFilterOn=w=>!!newsCfg&&(w>=240||!!newsQ||!!newsCfg.q);// an active filter is never hidden
const tw=(text,px)=>String(text).length*K.MONO*px;const salesN=Array.isArray(d.sales)?d.sales.filter(s=>s&&typeof s.ticker==="string").length:0;const curN=d.currencies&&Array.isArray(d.currencies.rows)?d.currencies.rows.filter(r=>r&&typeof r.iso==="string").length:0;const rulesN=alertRulesOf(d).length;const rulesBad=d.priceAlerts&&isFin(d.priceAlerts.invalid)?d.priceAlerts.invalid:0;const isObj=o=>!!(o&&typeof o==="object"&&!Array.isArray(o));const benchAny=!!(benchCap||benchLine||benchOff||benchCtl||benchNote);const lateAny=!!(lateShown.length||histProg||olderComing);// the annual rate joins the total-return row; with that row switched off it has its own
const trOn=showTotalReturn&&en("header.totalReturn");const has={"header.div":showDiv,"header.realized":hasRealized,"header.totalReturn":showTotalReturn,"header.annual":perfOn&&(trOn?perfYr:true),"graph.bench":benchAny,"graph.late":lateAny,"graph.backtest":simShown,"panel.today":!empty,"panel.sectors":!empty,"panel.risk":!empty,"panel.days":!empty,"panel.sales":salesN>0,"panel.income":isObj(d.dividends),"panel.rebalance":isObj(d.targets),"panel.currencies":!!(d.currencies&&isFin(d.currencies.foreign)&&d.currencies.foreign>0),"panel.priceAlerts":rulesN>0||rulesBad>0,"panel.alerts":alerts.length>0,"panel.news":true,// a tab row with nothing switched on in it goes; holdings needs a view (or the add
// form of an empty portfolio, or a stock opened here); the footer one of its parts
"graph.tabs":!!(rangeTabs.length||modesOn.length||inItems("graph.date")||readoutOn||inItems("graph.big")||from||state.mark),"panel.holdings":viewsOn.length>0||empty||!!focus,footer:inItems("footer.stats")||inItems("footer.updated")||inItems("footer.export")};// 13.6: the goal line (none without a goal, or in a currency with no rate)
const goalV=goalT;// goalView(d), made for goalTip above
has["header.goal"]=!!goalV&&!goalV.noRate;const goalNarrow=G.Wu-K.PAD_X<K.NARROW;const goalOk=has["header.goal"];const goalState=!goalOk?null:goalV.reached?"reached":goalV.passed?"passed":goalV.proj!==null?goalV.onTrack?"ontrack":"short":"progress";const goalBase=goalOk?"goal "+money(goalV.goal)+" by "+byLabel(goalV.g.date)+" · "+goalV.pctNow+"%":"";const goalSuffix=goalState==="reached"?" · reached":goalState==="passed"?" · date passed":goalState==="ontrack"?" · on track":goalState==="short"?" · "+goalV.shortPct+"% short"+(goalNarrow?"":" at your pace so far"):"";const on={};FEATURES.forEach(f=>{if(has[f.id]!==false&&enabled(win,f.id))on[f.id]=true;});const EYE=K.EYEBROW;const moversN=Math.max((d.movers&&d.movers.up||[]).length,(d.movers&&d.movers.down||[]).length);const rk=d.risk||{};const riskH=K.RISK_FIX+(perfBlk&&perfBlk.ok===true&&rk.real?2*K.RISK_ROW:perfWhy(perfBlk)?K.RISK_ROW:0)+(rk.backtest?K.RISK_ROW:0)+(rk.unscored&&rk.unscored.length?K.RISK_ROW:0);const addH=state.showAdd||empty?K.ADD_FORM+importH(state)+(// (13.5: the replace-or-keep line over the demo holdings)
demoKindOf(state,d)==="example"&&(demoOffered(state.pendingAction,demoKindOf(state,d))||state.imp&&state.imp.open&&(state.imp.rows||[]).length&&state.imp.ok)?K.ROW_LINE+4:0):0;const holdList=!focus&&!empty&&state.view==="list";const est={"panel.today":()=>EYE+5+moversN*K.MOVER_ROW+K.TODAY_FIX,"panel.sectors":()=>EYE+(d.themes||[]).length*K.THEME_ROW,"panel.risk":()=>EYE+riskH,"panel.days":(w,R)=>EYE+(dayRows.length?3+Math.min(R.days,dayRows.length)*K.ROW_DAY+K.PAGER:K.RISK_ROW+5),"panel.holdings":(w,R)=>{if(focus)return EYE+(focus.pending?K.RISK_ROW+8:K.DETAIL+(hasPriceAlerts?K.DETAIL_X:0))+(state.detailMsg?K.RISK_ROW:0)+(notesOn(d)&&!focus.pending?(noteOf(state,d,focus.ticker)?K.NOTE_ROWS:K.STAT)+(state.noteEdit?K.NOTE_EDIT:0)+(state.noteMsg?K.RISK_ROW:0):0);// 13.6: note rows
if(state.view==="watch")return EYE+addH+(watchRows.length?watchRows.length*K.WATCH_ROW:K.EMPTY_MSG);if(empty)return EYE+addH+K.EMPTY_MSG;if(state.view==="map")return EYE+K.MAPTABS+addH+R.map;const r=Math.min(R.holdings,listRows.length);return EYE+addH+(w>=250?K.LEGEND:0)+r*K.ROW_HOLD+(r<listRows.length&&en("holdings.pages")?K.DOTS:0);},"panel.earnings":(w,R)=>{const r=Math.min(R.earnings,calendar.length);return EYE+(calendar.length?r*K.ROW_EARN:K.RISK_ROW+3)+(r<calendar.length?K.PAGER:0);},"panel.sales":()=>EYE+Math.min(salesN,state.salesExpanded===true?salesN:SALES_ROWS)*K.SALE_ROW+(salesN>SALES_ROWS?K.MORE:0),"panel.income":()=>EYE+incomeH(d.dividends,incomeViewOf(state,d.dividends),K),"panel.currencies":()=>EYE+Math.min(curN,CUR_ROWS)*K.CUR_ROW+(curN>CUR_ROWS?K.MORE:0)+K.CUR_FIX,"panel.rebalance":()=>EYE+K.REBAL_FIX+(d.targets&&d.targets.set===true?REBAL_ROWS*K.SALE_ROW:0),"panel.priceAlerts":()=>EYE+Math.min(rulesN,state.alertsExpanded?rulesN:ALERT_ROWS)*K.RULE_ROW+(rulesN>ALERT_ROWS?K.MORE:0)+(state.alertMsg&&!state.focusTicker?K.RISK_ROW:0),"panel.alerts":()=>EYE+alerts.length*(K.ROW_ALERT+1),"panel.news":(w,R)=>{if(!newsCfg)return EYE+(feed.rows.length?Math.min(R.news,feed.rows.length)*K.ROW_NEWS+(R.news<feed.rows.length?K.PAGER:0):K.RISK_ROW+3);const pgs=pageEntries(newsEntries,Math.max(1,R.news)),p0=pgs[0];const body=p0.length?p0.reduce((h,e)=>h+(e.kind==="head"?K.ROW_NEWS_GROUP:newsRowH),0):K.RISK_ROW+3;return EYE+(newsFilterOn(w)&&newsOn(state)?K.NEWS_FILTER:0)+body+(pgs.length>1?K.PAGER:0)+K.NEWS_STATUS;}};const headLines=[[{id:"header.value",w:tw(money(totals.value),22)},{id:"header.day",w:tw(signedMoney(totals.dayChange)+" · "+pct(totals.dayChangePct),12)+K.COL_GAP}],[{id:"header.fx",w:tw("prices "+signedMoney(totals.priceEffect)+(fxMain?" · fx "+signedMoney(totals.fxEffect)+"  ("+fxMain.pair+" "+fxMain.rate+" "+pct(fxMain.changePct)+(d.fx.length>1?" +"+(d.fx.length-1):"")+")":""),9)},{id:"header.pl",w:tw(state.plMode==="invested"?"in "+money(totals.invested)+" → "+signedMoney(totals.plVsInvested)+" ("+pct(totals.plVsInvestedPct)+")":"P&L "+signedMoney(totals.pl)+" ("+pct(totals.plPct)+")",9)+K.COL_GAP},{id:"header.div",w:showDiv?tw(" · div ~"+money(totals.annualDividends)+"/yr",9):0}],[{id:"header.realized",w:hasRealized?tw("realized "+signedMoney(totals.realized)+" · ytd "+signedMoney(totals.realizedYtd),9):0},{id:"header.totalReturn",w:tw("total return "+signedMoney(totals.totalReturn)+" ("+pct(totals.totalReturnPct)+")",9)+K.COL_GAP}].concat(trOn&&perfYr?[{id:"header.annual",w:tw(" · "+pct1(perfBlk.xirrPct)+"/yr",9)}]:[]),trOn?[]:[{id:"header.annual",w:perfOn?tw(pct1(perfBlk.totalPct)+" total · "+pct1(perfBlk.xirrPct)+"/yr",9):0}],[{id:"header.goal",w:goalOk?tw(goalBase+goalSuffix,9)+K.GOAL_BAR:0}]];const tabW=(label,tight)=>tw(label,9)+(tight?K.CHIP_TIGHT:K.CHIP_PAD);// 13.6: a narrow window (< K.NARROW) drops the date box and puts the change
// figure (and ⤢) at the end of the tabs line instead of beside it
const toolbarNarrow=G.Wu<K.NARROW;const dateOn=inItems("graph.date")&&!toolbarNarrow;const tabsReadout=toolbarNarrow&&!readoutOwnLine&&!sectorMode&&(readoutOn||inItems("graph.big"))?K.TAB_READOUT:0;const tabWs=rangeTabs.map(r=>tabW(r,btTabs.length>0)).concat(rangeTabs.length&&modesOn.length?[K.TAB_SEP]:[],modesOn.map(m=>tabW(m==="pl"?"p&l":m)),dateOn?[K.DATE_BOX]:[]);if(from)tabWs.push(tabW("from "+fmtDayY(from.t)+" 00:00 ×")+4);else if(state.mark)tabWs.push(tabW("start here")+4);const sectorFacets=sectorMode&&sectorData&&sectorData.t&&sectorData.t.length>=2?1+(sectorData.themes||[]).length:0;// the welcome card (13.4): while the holdings are still the demo portfolio's,
// in the first window only, until "hide" (set_setting welcome false)
// (only where its buttons work: the + form lives in the holdings panel)
const welcomeOn=d.demo===true&&uiPrefs(state).welcome!==false&&!(G.win&&G.win.idx)&&!compactOf(state)&&enabled(win,"panel.holdings");const L=layoutFor(win,{Wu:G.Wu,Hu:G.Hu,on:on,order:itemsOf(win),est:est,head:headLines,tabs:tabWs,lists:{holdings:holdList?listRows.length:null,earnings:calendar.length||null,days:dayRows.length||null,news:newsEntries.length||null,map:!focus&&!empty&&state.view==="map"},big:bigOn,sector:sectorMode,facets:sectorFacets,focusSector:!!focusName,focusList:focusName&&focusName!=="portfolio"?5+2*K.RISK_ROW:0,readoutOwnLine:readoutOwnLine,tabsReadout:tabsReadout,notesForced:!!state.dayMsg||sectorMode,benchLine:benchAny,lateLine:lateAny,simCap:simShown,benchPick:benchCtl&&!!state.benchPick,loading:env.status==="loading",warn:!!((d.missingTickers||[]).length||env.lastFetchFailed),welcome:welcomeOn,mapWide:state.view==="map",expanded:!!state.mapExpanded,tOn:tOn,undated:anyUndated,cellsOn:{spark:on["row.spark"],vol:on["row.vol"],drift:on["row.drift"],day:!!on["row.day"],value:on["row.value"],pl:on["row.pl"],price:on["row.price"]}});const sh=id=>!!L.show[id];const editor=editorNode(state,dispatch,d,L,has);// the ⚙ editor (null while closed)
// folded (or switched off): the index line and its caption, the "starts later" note
const bOn=sh("graph.bench"),lOn=sh("graph.late");if(!bOn){benchLine=null;benchCap=null;benchOff=false;benchCtl=false;benchNote=null;}if(!lOn){lateShown=[];histProg=null;olderComing=false;}const headOn=HEAD_IDS.some(sh);const graphOn=sh("graph")||sh("graph.mini");const colsGap=headOn||graphOn;const TAB_WRAP={display:"flex",flexWrap:"wrap",alignItems:"baseline",rowGap:2,flex:"1 1 auto",minWidth:0};const GAP_IN=K.GAP-10;// the part of a sectionGap inside an element's box (padding + border; the margin is outside)
const lineStyle=(i,st)=>L.head[i]>1?Object.assign({},st,{flexWrap:"wrap",rowGap:2}):st;const narrow=L.unitW<K.COL_BASE;// columns narrower than 12.11's: labels are cut with "…"
const CUT={whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",minWidth:0};// pages from the rows the layout gives each list
const rowsH=L.rows.holdings,rowsE=L.rows.earnings;const pages=Math.max(1,Math.ceil(listRows.length/rowsH));const page=state.pinnedPage!==null&&state.pinnedPage<pages?state.pinnedPage:Math.floor(Math.max(0,state.rot-(state.rotBase||0))/HOLD_TICKS)%pages;const pageRows=listRows.slice(page*rowsH,(page+1)*rowsH);const earnPages=Math.max(1,Math.ceil(calendar.length/rowsE));const earnPage=Math.min(state.earnPage,earnPages-1);const earningsShown=calendar.slice(earnPage*rowsE,(earnPage+1)*rowsE);// the carousel's sections (pinnedSection indexes this whole list; a unit
// of the layout shows its own members, rotating when there are several)
const sections=[{id:"panel.today",label:"today · "+curSymbol()+" movers · top 5",node:html(SectionToday,{d:d})},{id:"panel.sectors",label:"sectors · "+effRange+" trend · value · day · vol",short:"sectors · trend · day · vol",node:html(SectionThemes,{d:d,range:effRange,dispatch:dispatch,w:L.unitW})},{id:"panel.risk",label:d.performance||d.risk&&(d.risk.real||d.risk.backtest)?"risk · drawdown · beta · volatility":"risk · volatility (3 mo)",node:html(SectionRisk,{d:d})},{id:"panel.days",label:"days · value at each day's end",node:html(SectionDays,{d:d,state:state,dispatch:dispatch,daily:dayRows,rows:L.rows.days})}];// the title row: fixed above the scrolling body, and the drag handle
const titleRow=html("div",{className:rowFlex},html("span",{className:eyebrow,style:{cursor:"pointer"},onClick:titleClick(state,dispatch),title:(sessionTip?sessionTip+"\n":"")+"click: one line · drag the row to move the widget"},title,"\xA0",html("span",{style:{color:d.session==="open"?C.up:d.session==="pre"||d.session==="after"?C.amber:C.dim}},"\u25CF"),html("span",null," ",d.session==="pre"?"pre-market":d.session==="after"?"after hours":d.session==="open"?"open":"closed")),html("span",{className:eyebrow,title:"display currency \u2014 set with _settings.currency in positions.json"},gearNode(state,dispatch,{marginRight:8}),d.currency));// each header line shows the items the layout keeps; a line wider than the
// window wraps (lineStyle), a line with nothing left goes
const headerBlock=!headOn?null:html("div",{"data-pw-panel":"header","data-pw-est":L.est.header},sh("header.value")||sh("header.day")?html("div",{className:rowFlex,style:lineStyle(0,{marginTop:3})},sh("header.value")?html("span",{className:(0,_uebersicht.css)(_templateObject150(),mono)},money(totals.value)):null,sh("header.day")?html("span",{className:mono,style:{fontSize:12,color:upDown(totals.dayChange||0)},title:"today's change"},signedMoney(totals.dayChange)," \xB7 ",pct(totals.dayChangePct)):null):null,sh("header.fx")||sh("header.pl")||sh("header.div")?html("div",{className:rowFlex,style:lineStyle(1,{marginTop:3})},sh("header.fx")?html("span",{className:(0,_uebersicht.css)(_templateObject151(),mono,C.dim),title:fxMain?"today's change from prices vs. from exchange rates"+(d.fx.length>1?"\n"+d.fx.map(f=>f.pair+" "+f.rate+" "+pct(f.changePct)).join("\n"):""):"today's change from prices"},"prices ",signedMoney(totals.priceEffect),fxMain?" · fx "+signedMoney(totals.fxEffect)+"  ("+fxMain.pair+" "+fxMain.rate+" "+pct(fxMain.changePct)+(d.fx.length>1?" +"+(d.fx.length-1):"")+")":""):null,sh("header.pl")||sh("header.div")?html("span",{className:sh("header.pl")?(0,_uebersicht.css)(_templateObject152(),mono,C.dim):(0,_uebersicht.css)(_templateObject153(),mono,C.dim),onClick:sh("header.pl")?()=>dispatch({type:"TOGGLE_PL_MODE"}):undefined,title:sh("header.pl")?"click to switch: profit against what you paid, or against the money you put in (⚙ → Portfolio → money put in so far)":undefined},!sh("header.pl")?null:state.plMode==="invested"?totals.invested?html("span",null,"in ",money(totals.invested)," \u2192 ",html("span",{style:{color:upDown(totals.plVsInvested||0)}},signedMoney(totals.plVsInvested)," (",pct(totals.plVsInvestedPct),")")):html("span",null,"money put in: not set \u2014 \u2699 \u2192 Portfolio"):html("span",null,"P&L ",html("span",{style:{color:upDown(totals.pl||0)}},signedMoney(totals.pl)," (",pct(totals.plPct),")")),sh("header.div")?sh("header.pl")?" · div ~":"div ~":null,sh("header.div")?money(totals.annualDividends):null,sh("header.div")?"/yr":null):null):null,sh("header.realized")||sh("header.totalReturn")?html("div",{className:rowFlex,style:lineStyle(2,{marginTop:2})},hasRealized&&!sh("header.realized")?null:html("span",{className:(0,_uebersicht.css)(_templateObject154(),mono,C.dim),title:"gains from recorded sales (oldest shares sold first, no fees) \xB7 ytd = sales this year"},realizedUnknown?html("span",{title:"no purchase price for the shares sold, so the gain is unknown"},"realized — ("+unknownSales+" unknown)"):hasRealized?html("span",null,"realized ",html("span",{style:{color:upDown(totals.realized)}},signedMoney(totals.realized))," · ytd ",html("span",{style:{color:isFin(totals.realizedYtd)?upDown(totals.realizedYtd):C.dim}},signedMoney(isFin(totals.realizedYtd)?totals.realizedYtd:null))):null),sh("header.totalReturn")?html("span",{className:(0,_uebersicht.css)(_templateObject155(),mono,C.dim),title:perfOn?"total return: unrealized + realized + dividends received, cost at today's exchange rate\n"+perfTip:"unrealized + realized + dividends received"},"total return ",html("span",{style:{color:upDown(totals.totalReturn)}},signedMoney(totals.totalReturn),isFin(totals.totalReturnPct)?" ("+pct(totals.totalReturnPct)+")":""),perfYr&&sh("header.annual")?" · ":null,perfYr&&sh("header.annual")?html("span",{style:{color:upDown(perfBlk.xirrPct)}},pct1(perfBlk.xirrPct)+"/yr"):null):null):null,perfOn&&!(showTotalReturn&&sh("header.totalReturn"))&&sh("header.annual")?html("div",{className:rowFlex,style:lineStyle(3,{marginTop:2})},html("span",{className:(0,_uebersicht.css)(_templateObject156(),mono,C.dim),title:perfTip},html("span",{style:{color:upDown(perfBlk.totalPct)}},pct1(perfBlk.totalPct))," total",perfYr?" · ":null,perfYr?html("span",{style:{color:upDown(perfBlk.xirrPct)}},pct1(perfBlk.xirrPct)+"/yr"):null)):null,sh("header.goal")&&goalOk?html("div",{className:rowFlex,style:lineStyle(4,{marginTop:2}),"data-pw-goal":goalState},html("span",{className:(0,_uebersicht.css)(_templateObject157(),mono,C.dim),title:goalTip},"goal ",html("span",{style:{color:C.ink}},money(goalV.goal))," by "+byLabel(goalV.g.date)+" · ",html("span",{style:{color:C.ink}},goalV.pctNow+"%"),html("span",{className:goalBar,"data-pw-goal-bar":"1"},html("span",{style:{display:"block",width:Math.min(100,Math.max(0,goalV.pctNow))+"%",height:"100%",background:goalV.reached?C.up:C.line}})),html("span",{style:{color:goalState==="reached"||goalState==="ontrack"?C.up:C.dim}},goalSuffix))):null);const missing=d.missingTickers||[];// the export's message (12.11) stays EXPORT_TICKS data ticks
const exportShown=state.exportMsg&&state.tick-state.exportMsg.tick<=EXPORT_TICKS?state.exportMsg:null;// the footer line (a fold unit) and the loading line (always); then the
// "+N hidden" hint when the layout folded anything
const footGap=headOn||graphOn||L.cols.length>0||!!state.mapExpanded;// its parts as switched on (footer.stats / .updated / .export); with the
// footer off or folded its red warnings (no data, last refresh failed) stay
const failed=!!env.lastFetchFailed;const footOn=sh("footer");const fStats=footOn&&inItems("footer.stats"),fUpd=footOn&&inItems("footer.updated"),fExp=footOn&&inItems("footer.export");const upText=fUpd&&env.status!=="loading"?"updated "+fmtAge(env.cacheAgeSeconds)+" ago":"";// (13.5) all markets closed: the tracker checks less often (refreshAfter up to 30 min) — say so on hover
const upTip=Number(d.refreshAfter)>270?"markets closed — next check in "+Math.max(0,Math.round((Number(d.refreshAfter)-(Number(env.cacheAgeSeconds)||0))/60))+" min":"";// (only "updated" switched on while loading: nothing to say yet, no empty line)
// (13.5: "empty" = the demo is gone and nothing added yet — only the first step)
const demoGone=d.demoKind==="empty";const welcomeBlock=!welcomeOn?null:html("div",{className:welcomeCss,"data-pw-panel":"welcome","data-pw-est":LAYOUT_K.WELCOME,"data-pw-demo":d.demoKind||undefined},html("div",{className:rowFlex,style:{alignItems:"baseline"}},html("span",{className:eyebrow,style:{color:C.ink}},demoGone?"no holdings yet — add your first:":demoNOf(d)?"welcome — these "+demoNOf(d)+" holdings are a demo; replace them with yours:":"welcome — these holdings are a demo; replace them with yours:"),html("span",{className:linkBtn,style:{fontSize:8.5},"data-pw-welcome":"hide",title:"hide this card (\u2699 \u2192 Portfolio \u2192 welcome card brings it back)",onClick:()=>saveSetting("welcome","false",dispatch)},"hide")),html("div",{className:welcomeLine},html("span",{style:edDim},"1."),html("span",null,"your stocks:"),html("span",{className:welcomeChip,title:"add one stock at a time (any stock Yahoo Finance lists)","data-pw-welcome":"add",onClick:()=>{if(!state.showAdd)dispatch({type:"TOGGLE_ADD"});}},"+ add one"),html("span",{className:welcomeChip,title:"paste a list, or pick a CSV file exported from your broker","data-pw-welcome":"import",onClick:()=>openImport(state,dispatch)},"import a list\u2026"),demoGone?null:html("span",{className:welcomeChip,title:"remove the demo holdings first (a backup of the file is kept)","data-pw-welcome":"fresh",onClick:()=>{if(!state.showAdd)dispatch({type:"TOGGLE_ADD"});dispatch({type:"SET_PENDING",pending:{kind:"reset",cmd:helper(["sell","--reset-all"]),label:"remove "+demoWord(demoNOf(d))+"? (a backup is kept; your settings and cash stay)"}});}},"start fresh")),demoGone?null:html("div",null,html("div",{className:welcomeLine},html("span",{style:edDim},"2."),html("span",null,"your currency, index and look:"),html("span",{className:welcomeChip,"data-pw-welcome":"portfolio",onClick:()=>dispatch({type:"OPEN_EDITOR",group:"portfolio"})},"\u2699 portfolio settings")),html("div",{className:welcomeLine},html("span",{style:edDim},"3."),html("span",null,"what this window shows:"),html("span",{className:welcomeChip,"data-pw-welcome":"panels",onClick:()=>dispatch({type:"OPEN_EDITOR",group:"panels"})},"\u2699 what it shows"),html("span",{style:edDim},"\u2014 or drag the edges to resize it"))));// the update offer (13.4): GitHub's newest release when newer than this VERSION
// (not after "later" for that version); the result of the last update.sh run
const updInfo=d.update&&typeof d.update==="object"?d.update:null;const upd=updInfo&&updInfo.latest&&newerVersion(updInfo.latest,VERSION)&&state.updateLater!==updInfo.latest?updInfo:null;const updRes=env.updateResult&&typeof env.updateResult==="object"?env.updateResult:null;// a note from this run of the widget, unless the finished update (data.json) is fresher
const umStale=!state.updateMsg||state.updateMsg.version!==VERSION||!state.updateMsg.err&&updRes&&updRes.ok===true&&updRes.to===VERSION;const umLive=umStale?null:state.updateMsg;const updMsg=umLive&&state.tick-umLive.tick<=EXPORT_TICKS?umLive:updRes&&updRes.ok===true&&updRes.to===VERSION?{text:"updated to "+updRes.to+" ✓",err:false}:updRes&&updRes.ok===false&&updRes.message?{text:"update failed: "+String(updRes.message).slice(0,90),err:true}:null;const askLine=upd&&state.updateAsk?html("div",{className:(0,_uebersicht.css)(_templateObject158(),mono,C.amber),"data-pw-update-ask":"1"},"update to "+upd.latest+" now? Your holdings, settings and history stay; the widget reloads by itself. ",html("span",{className:linkBtn,style:{color:C.ink},onClick:()=>runUpdate(upd,dispatch)},"yes, update")," · ",upd.url?html("span",{className:linkBtn,onClick:()=>(0,_uebersicht.run)("open "+shq(upd.url))},"what's new"):null,upd.url?" · ":"",html("span",{className:linkBtn,onClick:()=>dispatch({type:"UPDATE_LATER",version:upd.latest})},"later")):null;const footerBlock=html("div",null,askLine,fStats||fExp||upText||missing.length||failed||upd||updMsg?html("div",{className:footGap?(0,_uebersicht.css)(_templateObject159(),sectionGap):(0,_uebersicht.css)(_templateObject160()),"data-pw-panel":"footer","data-pw-est":L.est.footer+(footGap?GAP_IN:0)},html("span",{className:(0,_uebersicht.css)(_templateObject161(),mono,C.dim)},fStats&&d.derivedBasisCount>0?html("span",{title:"\u2248 = no purchase price given, so the close on the buy date is used as the cost"},"≈ "+d.derivedBasisCount+" estimated cost · "):null,fStats?html("span",{title:"value snapshots recorded so far (one per refresh); before them the graph is rebuilt from past prices (\u2248 when you hover)"},plural(d.snapshotCount,"value")," recorded"):null,missing.length?html("span",{style:{color:C.down},title:"Yahoo has no data for: "+missing.join(" ")+"\n(typo? delisted?) — they're left out of the totals"},(fStats?" · ":"")+"no data: "+missing.slice(0,4).join(" ")+(missing.length>4?" +"+(missing.length-4):"")):null),html("span",{className:(0,_uebersicht.css)(_templateObject162(),mono,C.dim)},upd?html("span",{className:linkBtn,style:{fontSize:8,color:C.amber},"data-pw-update":upd.latest,title:"version "+upd.latest+" is out (you have "+VERSION+") — click to update; your holdings and history stay",onClick:()=>dispatch({type:"UPDATE_ASK",on:!state.updateAsk})},"update "+upd.latest+" ▸"):null,upd&&(updMsg||fExp||failed||upText)?" · ":"",updMsg?html("span",{style:{color:updMsg.err?C.down:C.up},"data-pw-update-msg":updMsg.err?"err":"ok",title:updMsg.text},updMsg.text):null,updMsg&&(fExp||failed||upText)?" · ":"",fExp?html("span",{className:linkBtn,style:{fontSize:8},onClick:()=>exportCsv(state,dispatch),title:"save holdings, daily values and sales as CSV files in ~/Documents/Portfolio and show them in Finder"},"export"):null,fExp&&exportShown?html("span",{style:{color:exportShown.err?C.down:C.dim},title:exportShown.tip||""}," "+exportShown.text):null,fExp&&(failed||upText||fUpd&&env.status!=="loading")?" · ":"",failed?html("span",{style:{color:C.down},title:plainError(env.errorText).text+(env.errorText?"\n\n"+env.errorText:"")},"last refresh failed"+(fUpd?" · ":"")):null,upText?html("span",{title:upTip||undefined,"data-pw-updated":"1"},upText):null)):null,env.status==="loading"?html(LoadingLine,{progress:env.progress}):null,!headOn&&!graphOn&&!L.cols.length&&!state.mapExpanded&&!footOn&&!missing.length&&!failed&&env.status!=="loading"?html("div",{className:(0,_uebersicht.css)(_templateObject163(),mono,C.dim),"data-pw-hint":"empty",onClick:()=>dispatch({type:"TOGGLE_EDITOR",group:"panels"})},"empty window \u2014 \u2699 to add features"):null,L.hint?html("div",{className:(0,_uebersicht.css)(_templateObject164(),mono,C.dim),"data-pw-hint":"1",title:"hidden because the window is too short: "+L.folded.map(id=>FEATURE_BY[id]?FEATURE_BY[id].label:id).join(", ")+"\nmake the window taller, or change what it shows with ⚙",onClick:()=>dispatch({type:"TOGGLE_EDITOR",group:editGroupOf(L.folded[0])})},"+"+L.folded.length+" hidden — ⚙"):null);// the header readout: the value (or p&l) under the crosshair, else the change over the range
const readoutNode=html("span",{className:mono,style:{fontSize:10,whiteSpace:"nowrap"}},sectorMode?hovering||markT!==null?html("span",{style:{color:C.dim}},fmtStamp(activeT,baseRange!=="1Y"&&!btRange)):sectorData?html("span",{style:{color:C.dim}},"portfolio ",html("span",{style:{color:upDown(sectorData.total[sectorData.total.length-1]||0)}},pct(sectorData.total[sectorData.total.length-1]))):"":readout?html("span",null,html("span",{style:{color:C.ink,fontSize:11}},plGraph?signedExact(plOf(readout)):money(readout.v,true)),html("span",{style:{color:C.dim}},"  "+fmtStamp(readout.t,!readout.d&&!readout.sim&&!btRange&&!(readout.approx&&baseRange==="1Y")))):rangePerf?html("span",{style:{color:upDown(rangePerf.gain)},title:"change over the range"+(Math.abs(rangePerf.flow)>0.5?" — "+signedMoney(rangePerf.flow)+" of new buys left out":"")+(rangePerf.twr?"\nthe % is time-weighted: the growth of each stretch between purchases, chained, so new money never counts as a gain (it includes the simulated years)":Math.abs(rangePerf.flow)>0.5?"\nthe % is the return on money while it was invested (new money counts from the middle of the range), so it can differ from the P&L % up top (gain ÷ everything you paid)":"")},signedMoney(rangePerf.gain)+" · "+pct(rangePerf.pct)):"");// the graph toolbar's right end: the change figure and ⤢ (13.6: in a narrow
// window it moves onto the tabs line; marginLeft auto keeps it at the end)
const readoutInTabs=toolbarNarrow&&L.tabWrap&&!readoutOwnLine&&!sectorMode;const graphRightNode=readoutOn&&!readoutOwnLine||inItems("graph.big")&&!sectorMode?html("span",{"data-pw-graph-readout":readoutInTabs?"tabs":"right",style:{marginLeft:"auto",whiteSpace:"nowrap",display:"flex",alignItems:"baseline",minWidth:0}},readoutOwnLine||!readoutOn?null:// too long (8-figure values, long dates): cut with "…" rather than wrap
html("span",{style:{minWidth:0,overflow:"hidden",textOverflow:"ellipsis"}},readoutNode),sectorMode||!inItems("graph.big")?null:html("span",{className:tabBtn,style:{marginLeft:6,fontSize:10,flex:"none"},title:bigOn?"back to normal size":"make the graph bigger",onClick:()=>state._disp?changeWin(state,state._win.id,{graphBig:!bigOn},dispatch):savePref("graphBig",!bigOn,dispatch)},bigOn?"⤡":"⤢")):null;/* -------- expanded heatmap: the map takes over the whole widget -------- */if(state.mapExpanded){return frame(state,dispatch,titleRow,html("div",{"data-pw-t":Math.round(L.T),"data-pw-scroll":L.scroll?"1":"0"},editor,headerBlock,welcomeBlock,html("div",{className:headOn?sectionGap:""},html("div",{className:rowFlex},html("span",{className:eyebrow},"holdings \xB7 map"),html(MapTabs,{state:state,dispatch:dispatch,drift:driftOn,range:mapRange,extra:html("span",{className:tabBtn,title:"back to the normal layout",onClick:()=>dispatch({type:"TOGGLE_MAP_EXPAND"})},"collapse")})),html(Heatmap,{positions:positions,range:mapRange,w:L.mapBigW,h:L.mapBigH,d:d,onSelect:t=>openStock(t,dispatch,state)})),footerBlock),hover);}const carouselNode=(ids,first,attrs)=>{const list=sections.map((sc,i)=>Object.assign({i:i},sc)).filter(sc=>ids.indexOf(sc.id)>=0);if(!list.length)return null;const pinned=list.length>1&&state.pinnedSection!==null?list.find(sc=>sc.i===state.pinnedSection)||null:null;const cur=pinned||list[Math.floor(state.rot/TICKS_PER_PAGE)%list.length];// 13.6: a label too long for the column gives way to its short form; never wraps
const lbl=cur.short&&cur.label.length*K.EYE_CH+list.length*11>L.unitW?cur.short:cur.label;return html("div",_extends({className:first?undefined:sectionGap},attrs),html("div",{className:rowFlex},html("span",{className:eyebrow,style:Object.assign({flex:"1 1 auto"},CUT),title:cur.label},lbl,pinned?html("span",{"data-pw-pinned":"section",title:"staying on this page \u2014 click the lit dot to let them turn again"}," \u2316"):null),list.length>1?html("span",{style:{flex:"none"}},list.map(sc=>html("span",{key:sc.label,onClick:()=>dispatch({type:"SET_SECTION",section:sc.i}),className:dot,title:sc.label+(state.pinnedSection===sc.i?" — staying here · click again to let the boxes take turns":" — click to stay on this one"),style:{color:sc===cur?C.ink:C.dim}},"\u25CF"))):null),cur.node);};const holdingsNode=(first,attrs)=>html("div",_extends({className:first?"":sectionGap},attrs),focus?html("div",null,html("div",{className:rowFlex},html("span",{className:eyebrow,style:{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:L.focusEyebrowW},title:(focus.name||"")+(focus.theme?" · "+focus.theme:"")},focus.ticker,focus.name||focus.theme?" · "+(focus.name||focus.theme):"",focusHeld?"":focusWatched?" · watching":""),html("span",{style:{whiteSpace:"nowrap"}},focusHeld||focus.pending?null:html("span",{className:tabBtn,title:focusWatched?"stop monitoring":"monitor it in the watch tab",onClick:()=>watchToggle(focus.ticker,!focusWatched,dispatch)},focusWatched?"unwatch":"watch"),focus.pending||!addOn?null:html("span",{className:tabBtn,title:"record a buy of this stock",onClick:()=>dispatch({type:"PREFILL",ticker:focus.ticker})},"buy"),html("span",{className:tabBtn,onClick:()=>dispatch({type:"SET_STOCK",ticker:null})},"back"))),state.detailMsg?html("div",{className:(0,_uebersicht.css)(_templateObject165(),mono,C.amber)},state.detailMsg):null,focus.pending?html("div",{className:(0,_uebersicht.css)(_templateObject166(),look.error?C.down:C.dim)},look.error||"looking up "+focus.ticker+"…"):html(StockDetail,{p:focus,earn:earnings.find(e=>e.ticker===focus.ticker),look:look,range:state.detailRange,dispatch:dispatch,chartW:L.priceW,tg:tOn&&en("detail.target")&&bucketFor(d,focus.targetKey)?Object.assign({band:bandOf(d)},bucketFor(d,focus.targetKey)):null}),!focus.pending&&notesOn(d)?// 13.6 data: a note and a price target
html(NoteRows,{p:focus,d:d,state:state,dispatch:dispatch,alertsOn:hasPriceAlerts&&en("detail.alerts"),narrow:L.CW<LAYOUT_K.NARROW}):null,!focus.pending&&hasPriceAlerts&&(en("detail.alerts")||en("detail.news"))?// 12.9+ data: the alert box and headlines exist
html(DetailExtras,{p:focus,d:d,state:state,dispatch:dispatch,alerts:en("detail.alerts"),news:en("detail.news")}):null):html("div",null,html("div",{className:rowFlex},html("span",{className:eyebrow,style:narrow?CUT:{whiteSpace:"nowrap"}},state.view==="watch"?"watchlist":"holdings",empty||state.view!=="list"?"":html("span",{"data-pw-holdings-page":"1",style:{cursor:"pointer"},title:"click for the next page \u2014 it then stays there (click the lit dot to let the pages turn every 30 s again)",onClick:()=>{if(pages>1)dispatch({type:"SET_PAGE",page:(page+1)%pages});}}," "+(page+1)+"/"+pages),state.view==="list"&&state.pinnedPage!==null?html("span",{"data-pw-pinned":"holdings",title:"staying on this page \u2014 click the lit dot to let them turn again"}," \u2316"):null),html("span",{style:narrow?{flex:"none",whiteSpace:"nowrap"}:undefined},addOn?html("span",{className:state.showAdd||empty?(0,_uebersicht.css)(_templateObject167(),tabBtn,tabActive):tabBtn,"data-pw-add-toggle":"1",title:"buy or sell (updates positions.json)",onClick:()=>dispatch({type:"TOGGLE_ADD"})},"+"):null,empty&&!watchRows.length||viewsOn.length<2?null:viewsOn.map(v=>html("span",{key:v,"data-pw-view":v,className:v===state.view?(0,_uebersicht.css)(_templateObject168(),tabBtn,tabActive):tabBtn,title:v==="map"?"heatmap: tile size = value, color = move (or volatility)":v==="watch"?"stocks you monitor without holding them":"list",onClick:()=>dispatch({type:"SET_VIEW",view:v})},v==="watch"&&watchRows.length?"watch "+watchRows.length:v)),!empty&&state.view==="list"&&en("holdings.sort")?html("span",{className:tabBtn,title:SORT_TIP[state.sort]+" — click to change",onClick:()=>dispatch({type:"CYCLE_SORT"})},"sort "+(state.sort==="value"?curSymbol():SORT_LABEL[state.sort])):null)),!empty&&!state.showAdd&&state.view==="list"&&L.holdW>=250?// the column names (13.5; not while the + form sits between them and the rows), same order and widths as the rows below
html("div",{"data-pw-holdings-legend":"1",className:rowFlex,style:anyUndated?{marginTop:3,columnGap:3}:{marginTop:3}},html("span",{className:eyebrow,style:merge(LEGEND_CELL,anyUndated?{flex:1,minWidth:52}:{width:52})},"ticker"),L.cells.spark?html("span",{className:eyebrow,title:"the price over the last 3 months",style:merge(LEGEND_CELL,{width:L.sparkW===LAYOUT_K.SPARK?LAYOUT_K.SPARK:L.sparkW,textAlign:"right"})},"3 mo"):null,L.cells.vol?html("span",{className:eyebrow,title:"volatility score 1\u201310: how much the price swung over the last 3 months \u2014 click a ticker for details",style:merge(LEGEND_CELL,{width:LAYOUT_K.CELL.vol,textAlign:"center"})},"vol"):null,L.cells.drift?html("span",{className:eyebrow,title:"how far each holding is from its target share",style:merge(LEGEND_CELL,{width:DRIFT_W,textAlign:"right"})},"drift"):null,L.cells.day?html("span",{className:eyebrow,style:merge(LEGEND_CELL,{width:LAYOUT_K.CELL.day,textAlign:"right"})},"day"):null,L.cells.price?html("span",{className:eyebrow,style:merge(LEGEND_CELL,{width:LAYOUT_K.CELL.price,textAlign:"right"})},"price"):null,L.cells.value?html("span",{className:eyebrow,style:merge(LEGEND_CELL,{width:LAYOUT_K.CELL.value,textAlign:"right"})},"value"):null,L.cells.pl?html("span",{className:eyebrow,title:"profit or loss since you bought",style:merge(LEGEND_CELL,{width:LAYOUT_K.CELL.pl,textAlign:"right"})},"p&l"):null):null,!empty&&state.view==="map"?// the map's own controls on a line of their own: next to list/map/watch
// they ran past the column into the one beside it
html("div",{className:(0,_uebersicht.css)(_templateObject169())},html(MapTabs,{state:state,dispatch:dispatch,drift:driftOn,range:mapRange,extra:html("span",{className:tabBtn,title:"make the map fill the widget",onClick:()=>dispatch({type:"TOGGLE_MAP_EXPAND"})},"\u2922")})):null,state.showAdd||empty?html(AddForm,{state:state,dispatch:dispatch,empty:empty,positions:positions,demoKind:demoKindOf(state,d)}):null,state.view==="watch"?watchRows.length===0?html("div",{className:(0,_uebersicht.css)(_templateObject170(),C.dim)},"Nothing watched yet. Search a stock with + and press \"watch\" to monitor it here \u2014 price, day move, sparkline and volatility, plus the big-move alerts."):watchRows.map(w=>html("div",{key:w.ticker,className:rowFlex,style:{marginTop:4}},html("span",{className:mono,onClick:()=>openStock(w.ticker,dispatch,state),title:(w.name||"")+" — click for details"+(nOn&&noteOf(state,d,w.ticker)?"\n"+noteTip(noteOf(state,d,w.ticker),w):""),style:withMarks(marksOf(w.ticker),{fontSize:10,width:60,cursor:"pointer",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"})},marksOf(w.ticker)?html("span",{style:TICKER_SHRINK},w.ticker):w.ticker,w.stale?html("span",{style:{color:C.down},title:"last known price"},"!"):null,html(Bell,{rules:rulesOn(w.ticker)}),nOn?html(NoteMark,{e:noteOf(state,d,w.ticker),p:w}):null),html("span",{style:{flex:1,minWidth:0,fontSize:9,color:C.dim,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",paddingRight:6}},w.name||w.theme),L.watchCells.spark?html(Spark,{values:w.spark,w:L.watchSparkW===LAYOUT_K.SPARK?undefined:L.watchSparkW}):null,L.watchCells.vol?html(VolBadge,{pct:w.volPct,score:w.volScore}):null,on["row.day"]?html("span",{className:mono,title:"today",style:{fontSize:9,width:44,textAlign:"right",color:upDown(w.dayChangePct||0)}},pct(w.dayChangePct)):null,html("span",{className:mono,title:"price in "+w.currency,style:{fontSize:9,width:54,textAlign:"right"}},num(w.price,w.price>=1000?0:2)),html("span",{className:dot,title:"stop watching",style:{color:C.dim,width:10,textAlign:"right"},onClick:()=>watchToggle(w.ticker,false,dispatch,"ADD_MSG")},"\xD7"))):empty?welcomeOn?null:// (13.5: the welcome card says it while it is shown)
html("div",{className:(0,_uebersicht.css)(_templateObject171(),C.dim)},"No holdings yet. Add one above, import a list\u2026 (in the + form), or open positions.json (\"show file\") and list them there \u2014 the README shows the format."):state.view==="map"?html(Heatmap,{positions:positions,range:mapRange,w:L.mapW,h:L.mapH,d:d,onSelect:t=>openStock(t,dispatch,state)}):// with any undated holding the ticker column takes the row's slack
// (same for every row and page, so the columns stay aligned) to
// make room for the "undated" tag
pageRows.map(p=>{const marked=marksOf(p.ticker);return html("div",{key:p.ticker,className:rowFlex,"data-pw-fresh":state.justAdded&&state.justAdded.seenTick!==null&&state.justAdded.ticker===p.ticker?"1":undefined,style:merge(anyUndated?{marginTop:4,columnGap:3}:{marginTop:4},state.justAdded&&state.justAdded.seenTick!==null&&state.justAdded.ticker===p.ticker?{background:"rgba(var(--pw-fg), 0.07)",borderRadius:3}:{})},html("span",{className:mono,onClick:()=>openStock(p.ticker,dispatch,state),title:(p.name||"")+" — click for details"+(high52Tip(p)?"\n"+high52Tip(p):"")+(nOn&&noteOf(state,d,p.ticker)?"\n"+noteTip(noteOf(state,d,p.ticker),p):""),style:withMarks(marked,anyUndated?{fontSize:10,flex:1,minWidth:52,cursor:"pointer",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}:{fontSize:10,width:52,cursor:"pointer",whiteSpace:"nowrap",overflow:"hidden"})},marked?html("span",{style:TICKER_SHRINK},p.ticker):p.ticker,p.basisDerived?html("span",{style:{color:C.amber},title:"\u2248 estimated cost (no purchase price given)"},"\u2248"):null,p.stale?html("span",{style:{color:C.down},title:"last known price \u2014 the latest fetch failed"},"!"):null,html(Bell,{rules:rulesOn(p.ticker)}),nOn?html(NoteMark,{e:noteOf(state,d,p.ticker),p:p}):null,dotOn?html(NewsMark,{items:markNewsOf(d,p.ticker,p.dayChangePct)}):null,p.undated===true?html("span",{title:UNDATED_TIP,style:{fontSize:7,color:C.dim,marginLeft:3,letterSpacing:"0.02em"}},"undated"):null),L.cells.spark?html(Spark,{values:p.spark,w:L.sparkW===LAYOUT_K.SPARK?undefined:L.sparkW}):null,L.cells.vol?html(VolBadge,{pct:p.volPct,score:p.volScore}):null,L.cells.drift?html(DriftBadge,{p:p,d:d}):null,L.cells.day?html("span",{className:mono,title:"today",style:{fontSize:9,width:LAYOUT_K.CELL.day,textAlign:"right",color:upDown(p.dayChangePct||0)}},pct(p.dayChangePct)):null,L.cells.price?html("span",{className:mono,title:"price"+(p.currency?" in "+p.currency:""),style:{fontSize:9,width:LAYOUT_K.CELL.price,textAlign:"right"}},isFin(p.price)?num(p.price,p.price>=1000?0:2):"—"):null,L.cells.value?html("span",{className:mono,title:"value",style:{fontSize:9,width:LAYOUT_K.CELL.value,textAlign:"right"}},money(p.value)):null,L.cells.pl?html("span",{className:mono,title:"P&L since you bought",style:{fontSize:9,width:LAYOUT_K.CELL.pl,textAlign:"right",color:upDown(p.plPct||0)}},pct(p.plPct)):null);}),!empty&&state.view==="list"&&pages>1&&en("holdings.pages")?html("div",{style:{marginTop:5,textAlign:"center",lineHeight:"12px"}},html("span",{"data-pw-page-prev":"1",className:pageDot,title:"previous page \u2014 it then stays there (click the lit dot to let the pages turn again)",style:{color:C.dim},onClick:()=>dispatch({type:"SET_PAGE",page:(page-1+pages)%pages})},"\u2039"),Array.from({length:pages}).map((_,i)=>html("span",{key:i,"data-pw-page-dot":i,onClick:()=>dispatch({type:"SET_PAGE",page:i}),className:pageDot,title:"page "+(i+1)+(state.pinnedPage===i?" — staying here · click again to let the pages turn every 30 s":" — click to stay on this page"),style:i===page?{color:C.ink,background:"rgba(var(--pw-fg), 0.12)"}:{color:C.dim}},"\u25CF")),html("span",{"data-pw-page-next":"1",className:pageDot,title:"next page \u2014 it then stays there (click the lit dot to let the pages turn again)",style:{color:C.dim},onClick:()=>dispatch({type:"SET_PAGE",page:(page+1)%pages})},"\u203A")):null));// first in its column: no wrapper (12.11's right column starts with these rows)
const earningsRows=()=>[html("div",{key:"eh",className:rowFlex},html("span",{className:eyebrow,style:{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",minWidth:0},title:"upcoming earnings · ± = the move options traders are pricing in for the report (shown within 30 days)"+(hasExDiv?"\nex-div = announced ex-dividend date (own the shares before it to get the payment)":"")},hasExDiv?"earnings · ± move · ex-div":"earnings · upcoming · ± expected move"),html("span",{className:(0,_uebersicht.css)(_templateObject172(),mono,C.dim)},calendar.length)),calendar.length===0?html("div",{key:"en",className:(0,_uebersicht.css)(_templateObject173(),C.dim)},"none scheduled"):earningsShown.map(e=>{const away=daysAway(e.date);const soon=away!==null&&away<=7;const exd=e.kind==="exdiv";return html("div",{key:e.ticker+"|"+e.kind,className:rowFlex,style:{marginTop:3},title:exd?exDivTip(e):undefined},html("span",{className:mono,style:{fontSize:9.5}},e.ticker,html("span",{style:{color:soon?C.amber:C.dim}}," \xB7 ",fmtDate(e.date),away!==null&&away>=0?" ("+(away===0?"today":away+"d")+")":""),exd?html("span",{style:{color:C.line}}," ex-div"):null,!exd&&e.impliedMovePct!==null&&e.impliedMovePct!==undefined?html("span",{style:{color:C.ink,opacity:0.85}}," \xB1",e.impliedMovePct,"%"):null),e.watch?html("span",{className:mono,style:{fontSize:9,color:C.dim},title:"on your watchlist"},"watching"):exd?html("span",{className:mono,style:{fontSize:9.5}},isFin(e.value)?"~"+money(e.value,true):""," ",html("span",{style:{color:C.dim}},"div")):html("span",{className:mono,style:{fontSize:9.5}},money(e.value)," ",html("span",{style:{color:C.dim}},e.weightPct,"%")));}),earnPages>1?html("div",{key:"ep",className:rowFlex,style:{marginTop:5}},html("span",{className:linkBtn,style:{fontSize:8,visibility:earnPage>0?"visible":"hidden"},onClick:()=>dispatch({type:"SET_EARN_PAGE",page:earnPage-1})},"\u2039 sooner"),html("span",{className:(0,_uebersicht.css)(_templateObject174(),mono,C.dim)},earnPage*rowsE+1+"–"+(earnPage*rowsE+earningsShown.length)+" of "+calendar.length+" · through "+fmtDate(calendar[calendar.length-1].date)),html("span",{className:linkBtn,style:{fontSize:8,visibility:earnPage<earnPages-1?"visible":"hidden"},onClick:()=>dispatch({type:"SET_EARN_PAGE",page:earnPage+1})},"later \u203A")):null];const earningsNode=(first,attrs)=>first?earningsRows():html("div",_extends({className:sectionGap},attrs),earningsRows());const alertsNode=(first,attrs)=>html("div",_extends({className:first?"":sectionGap},attrs),html("span",{className:eyebrow,title:hasPriceAlerts?"notifications sent: your price alerts (_alerts) and big daily moves (_settings.alerts in positions.json)":"big daily moves (turn on with _settings.alerts in positions.json)"},"alerts \xB7 last 7 days"),alerts.map((a,i)=>html("div",{key:i,className:rowFlex,style:{marginTop:3}},html("span",{className:mono,style:{fontSize:9,color:C.dim}},fmtDay(a.t)," ",fmtTime(a.t)),a.kind?html("span",{className:mono,style:{fontSize:9}},html(AlertLogText,{a:a})):html("span",{className:mono,style:{fontSize:9}},a.ticker," ",html("span",{style:{color:upDown(a.pct)}},pct(a.pct)),a.impact!==null&&a.impact!==undefined?html("span",{style:{color:C.dim}}," ",signedMoney(a.impact)):null))));// the news panel: headlines for the stock open here and today's movers,
// paged by the rows the layout gives it (per-window newsPage); a click opens
// the story (https only); with headlines off: "turn on" (_settings.news)
const newsNode=(first,attrs)=>{if(newsCfg)return newsPageNode(first,attrs);const rowsN=Math.max(1,L.rows.news||1),all=feed.rows;const nPages=Math.max(1,Math.ceil(all.length/rowsN));const pg=Math.min(state.newsPage||0,nPages-1);const shown=all.slice(pg*rowsN,(pg+1)*rowsN);const msg=(0,_uebersicht.css)(_templateObject175(),mono,C.dim);return html("div",_extends({className:first?"":sectionGap},attrs),html("span",{className:eyebrow,title:"the latest headlines for the stock open in this window and today's biggest movers (Yahoo, _settings.news)"},"news"),!newsOn(state)?html("div",{className:msg},"headlines off \xB7 ",html("span",{className:linkBtn,style:{fontSize:8.5},title:"show the latest headlines for the stock you open and for today's movers (_settings.news)",onClick:()=>{savePref("news",true,dispatch).then(()=>{if(state.focusTicker)loadNews(state.focusTicker,dispatch);});}},"turn on")):!all.length?html("div",{className:msg},feed.busy?"loading headlines…":"no recent headlines for today's movers"):shown.map((r,i)=>{const cmd=openCmd(r.it.url);const meta=[r.tk,typeof r.it.source==="string"&&r.it.source?r.it.source:null,agoText(r.it.time)||null].filter(x=>x).join(" · ");return html("div",{key:pg+":"+i,style:{marginTop:3,lineHeight:1.25,minWidth:0}},html("div",{style:Object.assign({fontSize:9.5,cursor:cmd?"pointer":"default",color:C.ink},CUT),title:r.it.title+(cmd?"\nclick to open "+r.it.url:""),onClick:()=>{if(cmd)(0,_uebersicht.run)(cmd).catch(()=>{});}},r.it.title),html("div",{className:(0,_uebersicht.css)(_templateObject176(),mono,C.dim),style:CUT},meta));}),nPages>1?html("div",{className:rowFlex,style:{marginTop:5}},html("span",{className:linkBtn,style:{fontSize:8,visibility:pg>0?"visible":"hidden"},onClick:()=>dispatch({type:"SET_NEWS_PAGE",page:pg-1})},"\u2039 back"),html("span",{className:(0,_uebersicht.css)(_templateObject177(),mono,C.dim)},pg*rowsN+1+"–"+(pg*rowsN+shown.length)+" of "+all.length),html("span",{className:linkBtn,style:{fontSize:8,visibility:pg<nPages-1?"visible":"hidden"},onClick:()=>dispatch({type:"SET_NEWS_PAGE",page:pg+1})},"more \u203A")):null);};// the news page (13.1): the window's `news` options — scope, per-ticker
// cap, sort, span, group, dense, sources, mute and the keyword (the filter
// box; Enter keeps it as cfg.q, Esc clears it). Tags open the stock (with a
// holdings panel here) or narrow the feed; × on hover mutes a ticker here.
const newsPageNode=(first,attrs)=>{const cfg=newsCfg;const msg=(0,_uebersicht.css)(_templateObject178(),mono,C.dim);const dimMono=(0,_uebersicht.css)(_templateObject179(),mono,C.dim);const setNews=patch=>changeWin(state,win.id,{news:normNews(Object.assign({},cfg,patch))||{}},dispatch);const setQuery=(v,from)=>dispatch({type:"SET_NEWS_QUERY",value:v,from:from});const clearQ=()=>{setQuery("","");if(cfg.q)setNews({q:""});};const openEditor=ev=>{if(!state.editOpen){bodyToTop(ev);dispatch({type:"TOGGLE_EDITOR",group:"panels"});}else if(state.editGroup!=="panels")dispatch({type:"EDIT_GROUP",group:"panels"});const root=ev&&ev.currentTarget&&ev.currentTarget.closest?ev.currentTarget.closest("[data-pw-win]"):null;setTimeout(()=>{try{const el=root?root.querySelector('[data-pw-feature="panel.news"]'):null;if(el&&el.scrollIntoView)el.scrollIntoView({block:"nearest"});}catch(e){/* no DOM: fine */}},80);};const canOpen=enabled(win,"panel.holdings");const tagClick=tk=>ev=>{ev.stopPropagation();if(isFeedKey(tk)){setQuery(newsTagText(tk),cfg.q);return;}// a market outlet (13.3): only its stories
if(!TICKER_RE.test(tk))return;if(canOpen)openStock(tk,dispatch,state);else setQuery(tk,cfg.q);};const tagTip=tk=>isFeedKey(tk)?"only "+newsTagText(tk)+" stories":canOpen?"open "+tk:"only "+tk+"'s headlines";const tag=(tk,key,style)=>html("span",{key:key,className:newsTagCss,style:style,title:tagTip(tk),onClick:tagClick(tk)},newsTagText(tk));const muteX=(tk,key)=>cfg.mute.length>=NEWS_LIST_MAX||!TICKER_RE.test(tk)?null:html("span",{key:key,className:"pw-mute",title:"hide "+tk+" here",onClick:ev=>{ev.stopPropagation();setNews({mute:cfg.mute.concat([tk])});}},"\xD7");const link=(txt,tip,fn)=>html("span",{className:linkBtn,style:{fontSize:8.5},title:tip,onClick:fn},txt);const agoShort=t=>agoText(t).replace(" ago","");const storyNode=(e,key)=>{const r=e.row,cmd=openCmd(r.url);const tip=r.title+(r.source?"\n"+r.source:"")+(isFin(r.time)?" · "+agoText(r.time):"")+(cmd?"\nclick to open "+r.url:"");const open=()=>{if(cmd)(0,_uebersicht.run)(cmd).catch(()=>{});};if(cfg.dense){return html("div",{key:key,className:newsRowCss,title:tip,onClick:open,style:{display:"flex",alignItems:"baseline",marginTop:2,lineHeight:1.25,minWidth:0,cursor:cmd?"pointer":"default"}},html("span",{style:Object.assign({fontSize:9.5,color:C.ink,flex:"1 1 auto"},CUT)},r.title),html("span",{className:dimMono,style:{whiteSpace:"nowrap",flex:"none"}},e.tags.slice(0,NEWS_DENSE_TAGS).map(t=>html("span",{key:t}," · ",tag(t,"t"),muteX(t,"m"))),e.tags.length>NEWS_DENSE_TAGS?" +"+(e.tags.length-NEWS_DENSE_TAGS):"",cfg.sources&&isFin(r.time)?" · "+agoShort(r.time):""));}const meta=[];e.tags.forEach((t,i)=>{if(i)meta.push(" · ");meta.push(tag(t,"t"+t));meta.push(muteX(t,"m"+t));});// a market story's source is its outlet — already the tag, not repeated
const fromFeed=e.tags.some(t=>isFeedKey(t)&&newsTagText(t)===r.source);const rest=(cfg.sources?[fromFeed?null:r.source||null,agoText(r.time)||null]:[]).filter(x=>x).join(" · ");if(rest)meta.push((meta.length?" · ":"")+rest);return html("div",{key:key,className:newsRowCss,style:{marginTop:3,lineHeight:1.25,minWidth:0}},html("div",{style:Object.assign({fontSize:9.5,cursor:cmd?"pointer":"default",color:C.ink},CUT),title:tip,onClick:open},r.title),html("div",{className:dimMono,style:CUT},meta));};const headNode=(e,key)=>html("div",{key:key,className:dimMono,style:Object.assign({marginTop:4,fontSize:8.5},CUT),title:e.n+(e.n===1?" story":" stories")+(isFin(e.move)?" · today "+pct(e.move):"")},tag(e.tk,"t",{color:C.ink}),(isFin(e.move)?" · "+pct(e.move):"")+" · "+e.n);const rowsN=Math.max(1,L.rows.news||1);const pages=pageEntries(feed.entries||[],rowsN),nPages=pages.length;const pg=Math.min(state.newsPage||0,nPages-1);const shown=pages[pg];const storiesBefore=pages.slice(0,pg).reduce((n,p)=>n+p.filter(e=>e.kind==="story").length,0);const storiesHere=shown.filter(e=>e.kind==="story").length;const ci=L.cols.findIndex(c=>c.some(u=>u.ids.indexOf("panel.news")>=0));const colW=ci>=0?L.colW[ci]:L.CW;const filterOn=newsFilterOn(colW);const scopeWord=cfg.scope==="pick"?cfg.tickers.length+" picked":NEWS_SCOPE_TEXT[cfg.scope]+(cfg.market.length?" + market":"");const nStories=feed.counts?feed.counts.stories:0;const nPlaced=cfg.group?(feed.entries||[]).filter(e=>e.kind==="story").length:nStories;const eye="news · "+scopeWord+" · "+nStories+(nStories===1?" story":" stories")+(feed.capped?" · capped":"")+(feed.updated?" · updated "+agoText(feed.updated):"");const eyeTip="news · "+cfg.scope+" · "+NEWS_SORT_TIP[cfg.sort]+" · "+cfg.per+" per stock · "+NEWS_SPAN_TIP[cfg.span]+(cfg.mute.length?" · "+cfg.mute.length+" muted":"")+(newsQ?" · filter '"+newsQ+"'":"")+(feed.capped?"\ncapped: the tracker keeps "+d.news.keep+" per stock (its largest window's setting, at most 300 stories)":"");const lim=d.news&&isFin(d.news.movePct)?d.news.movePct:NEWS_MOVE_PCT;const toWatch=ev=>{if(!canOpen)return openEditor(ev);if(state.focusTicker)dispatch({type:"SET_STOCK",ticker:null});dispatch({type:"SET_VIEW",view:"watch"});};let empty=null;if(!newsOn(state)){empty=html("div",{className:msg},"headlines off \xB7 ",link("turn on","show the latest headlines (_settings.news)",()=>{savePref("news",true,dispatch);}));}else if(!shown.length){if(cfg.scope==="pick"&&feed.scopeEmpty)empty=html("div",{className:msg},link("pick tickers in ⚙","news page settings",openEditor));else if(cfg.scope==="watch"&&feed.scopeEmpty)empty=html("div",{className:msg},"nothing on the watchlist \xB7 ",link("add stocks with watch",canOpen?"the holdings panel's watch view":"news page settings",toWatch));else if(cfg.scope==="movers"&&feed.scopeEmpty)empty=html("div",{className:msg},"no holding moved over "+lim+"% today · ",link("show every holding","headlines for every holding",()=>setNews({scope:"all"})));// a typed keyword that matches nothing says so first (the fetch note
// follows), so the user isn't told to wait for a word that isn't there
else if(feed.qHid)empty=html("div",{className:msg},"nothing matches '"+newsQ+"' · ",link("clear","clear the filter",clearQ),feed.pending.length?" · "+feed.pending.length+" still fetching":"");else if(feed.pending.length)empty=html("div",{className:msg},"fetching headlines… "+(feed.planned-feed.pending.length)+" of "+feed.planned+" tickers · next refresh in ~5 min · ",link("⚙","news page settings",openEditor));else if(feed.allMuted)empty=html("div",{className:msg},"everything is muted \xB7 ",html("span",{className:newsChipCss,title:"unmute all",onClick:()=>setNews({mute:[]})},cfg.mute.length+" muted ×"));else if(feed.spanHid)empty=html("div",{className:msg},"no headlines "+NEWS_SPAN_TEXT[cfg.span]+" · ",cfg.span==="week"?link("show all","headlines from any time",()=>setNews({span:"all"})):link("widen to a week","the last 7 days",()=>setNews({span:"week"})));else if(feed.busy)empty=html("div",{className:msg},"loading headlines\u2026");else empty=html("div",{className:msg},"no headlines yet \xB7 ",link("⚙","news page settings",openEditor));}const status=[];if(newsOn(state)){if(feed.updated)status.push(html("span",{key:"u",title:"when the tracker last fetched headlines"},"updated "+agoText(feed.updated)));if(feed.pending.length)status.push(html("span",{key:"p",title:"not fetched yet: "+feed.pending.join(" ")},"fetching "+feed.pending.length+" more…"));if(feed.failed.length)status.push(html("span",{key:"f",style:{color:C.amber},title:feed.failed.map(t=>t+": headlines unavailable (Yahoo)").join("\n")},feed.failed.length+" unavailable"));if(newsQ)status.push(html("span",{key:"q",className:newsChipCss,title:"clear the filter",onClick:clearQ},"filter: "+newsQ+" ×"));if(cfg.mute.length)status.push(html("span",{key:"m",className:newsChipCss,title:"muted here: "+cfg.mute.join(" ")+" — click to unmute all",onClick:()=>setNews({mute:[]})},cfg.mute.length+" muted ×"));if(cfg.span!=="all")status.push(html("span",{key:"s",className:newsChipCss,title:"show headlines from any time",onClick:()=>setNews({span:"all"})},NEWS_SPAN_CHIP[cfg.span]+" ×"));}return html("div",_extends({className:first?"":sectionGap},attrs),html("div",{style:{display:"flex",alignItems:"baseline",minWidth:0}},html("span",{className:eyebrow,style:CUT,title:eyeTip},eye),html("span",{className:newsChipCss,style:{marginLeft:5,flex:"none"},title:"news page settings",onClick:openEditor},"\u2699")),filterOn&&newsOn(state)?html("input",{className:inputCss,value:newsQ,placeholder:"filter\u2026",maxLength:NEWS_Q_MAX,style:{width:"100%",boxSizing:"border-box",fontSize:9,padding:"1px 4px",height:K.NEWS_FILTER-4,marginTop:2,display:"block"},title:"filter the headlines by a word (Enter keeps it for this window, Esc clears it)",onChange:ev=>setQuery(ev.target.value,cfg.q),onKeyDown:ev=>{if(isEnter(ev)){const v=ev.target.value;if(newsQOk(v)){setNews({q:v});setQuery(v,v);}}else if(isEscape(ev)){ev.stopPropagation();clearQ();}}}):null,empty,!empty?shown.map((e,i)=>e.kind==="head"?headNode(e,pg+":"+i):storyNode(e,pg+":"+i)):null,nPages>1?html("div",{className:rowFlex,style:{marginTop:5}},html("span",{className:linkBtn,style:{fontSize:8,visibility:pg>0?"visible":"hidden"},onClick:()=>dispatch({type:"SET_NEWS_PAGE",page:pg-1})},"\u2039 back"),html("span",{className:dimMono},storiesBefore+1+"–"+(storiesBefore+storiesHere)+" of "+nPlaced),html("span",{className:linkBtn,style:{fontSize:8,visibility:pg<nPages-1?"visible":"hidden"},onClick:()=>dispatch({type:"SET_NEWS_PAGE",page:pg+1})},"more \u203A")):null,html("div",{className:dimMono,style:{marginTop:3,height:K.NEWS_STATUS-3,lineHeight:"8px",display:"flex",alignItems:"baseline",columnGap:5,minWidth:0,overflow:"hidden",whiteSpace:"nowrap"}},status.map((x,i)=>i?[html("span",{key:"sep"+i},"\xB7"),x]:x)));};// one layout unit (a panel, or the carousel) at its place in a column
const unitNode=(u,first)=>{const attrs={key:u.key,"data-pw-panel":u.key,"data-pw-est":L.est[u.key]+(first?0:GAP_IN)};const id=u.ids[0];if(FEATURE_BY[id]&&FEATURE_BY[id].car)return carouselNode(u.ids,first,attrs);if(id==="panel.holdings")return holdingsNode(first,attrs);if(id==="panel.earnings")return earningsNode(first,attrs);if(id==="panel.sales")return html(SalesPanel,{d:d,totals:totals,expanded:state.salesExpanded===true,dispatch:dispatch,first:first,pw:attrs});if(id==="panel.income")return html(IncomePanel,{d:d,view:incomeViewOf(state,d.dividends),dispatch:dispatch,first:first,pw:attrs});if(id==="panel.currencies")return html(CurrenciesPanel,{d:d,w:L.unitW,first:first,pw:attrs});if(id==="panel.rebalance")return html(RebalancePanel,{d:d,state:state,dispatch:dispatch,first:first,pw:attrs});if(id==="panel.priceAlerts")return html(PriceAlertsPanel,{d:d,state:state,dispatch:dispatch,first:first,pw:attrs});if(id==="panel.alerts")return alertsNode(first,attrs);if(id==="panel.news")return newsNode(first,attrs);return null;};// the columns (layoutFor: 1–3, the holdings column wider in map view);
// 12.11's two keep their classes
const nCols=L.cols.length;const colClass=i=>nCols===1?colSolo:i===0?L.flex[0]!==1?colLeftWide:colLeft:i===nCols-1?colRight:colMid;const colStyle=i=>L.flex[i]!==1&&!(i===0&&nCols>1)?{flex:L.flex[i]}:undefined;return frame(state,dispatch,titleRow,html("div",{"data-pw-t":Math.round(L.T),"data-pw-scroll":L.scroll?"1":"0"},editor,headerBlock,welcomeBlock,graphOn?html("div",{className:headOn?sectionGap:"","data-pw-panel":"graph","data-pw-est":L.est.graph+(headOn?GAP_IN:0)},sh("graph.tabs")?html("div",{style:{display:"flex",flexWrap:readoutOwnLine||sectorMode||L.tabWrap?"wrap":"nowrap",alignItems:"baseline",columnGap:8,rowGap:2}},html("div",{style:L.tabWrap?TAB_WRAP:{whiteSpace:"nowrap",flex:"none"}},rangeTabs.map(r=>{const tb=BT_RANGES.indexOf(r)>=0?btTab(d,r):null;// with the backtest tabs the row gets tighter so it still fits the width
const tight=btTabs.length?{padding:"2px 4px"}:null;return html("span",{key:r,className:r===effRange&&!from?(0,_uebersicht.css)(_templateObject180(),tabBtn,tabActive):tabBtn,style:tb&&tb.short?Object.assign({opacity:0.5},tight):tight||undefined,title:r==="1D"?"the latest trading session":r==="ALL"?"everything since your first purchase — for any other start, type a date and press Enter":tb?(tb.short?"prices only reach back to "+fmtDayY(tb.start):r==="MAX"?"as far back as prices go (since "+fmtDayY(tb.start)+")":"the last "+BT_YEARS[r]+" years")+(tb.start<bt.anchor.t-1?" — before your first purchase: today's holdings, simulated":""):"the last "+{"1H":"hour","1W":"week","1M":"month","1Y":"year"}[r],onClick:()=>dispatch({type:"SET_RANGE",range:r})},r);}),rangeTabs.length&&modesOn.length?html("span",{className:(0,_uebersicht.css)(_templateObject181(),C.faint)}," | "):null,modesOn.map(m=>html("span",{key:m,className:m===state.graphMode?(0,_uebersicht.css)(_templateObject182(),tabBtn,tabActive):tabBtn,title:m==="pl"?"profit/loss over time (value minus what the holdings cost)":m==="sectors"?"how each sector has done over this range":"total value over time",onClick:()=>dispatch({type:"SET_GRAPH_MODE",mode:m})},m==="pl"?"p&l":m)),dateOn?html("input",{className:dayInputCss,placeholder:"YYYY-MM-DD",value:state.dayInput,"data-pw-day-input":"1",title:"type any day (2026-03-14, or just 03-14): you see what your portfolio was worth then \u2014 press Enter to start the graph on that day",onChange:ev=>onDayInput(ev.target.value,d,state,dispatch),onKeyDown:ev=>onDayKey(ev,d,state,dispatch),onKeyPress:ev=>ev.charCode===13?onDayKey(ev,d,state,dispatch):null}):null,from?html("span",{className:(0,_uebersicht.css)(_templateObject183(),tabBtn,tabActive),style:{marginLeft:4},title:"the graph starts here and every change is measured from here \u2014 click to go back to the normal ranges",onClick:()=>dispatch({type:"CLEAR_FROM"})},"from "+fmtDayY(from.t)+(rawSeries.length&&rawSeries[rawSeries.length-1].t-from.t<=36*3600?" "+fmtTime(from.t):"")+" ×"):state.mark?html("span",{className:(0,_uebersicht.css)(_templateObject184(),tabBtn,tabActive),style:{marginLeft:4},title:"start the graph at the pinned moment (or press Enter in the date box); every change figure is then measured from there",onClick:()=>dispatch({type:"SET_FROM",from:state.mark})},"start here"):null,readoutInTabs?graphRightNode:null),readoutInTabs?null:graphRightNode):null,sh("graph.tabs")&&readoutOwnLine?html("div",{style:{textAlign:"right",minHeight:14,lineHeight:"14px",marginTop:1,whiteSpace:"nowrap"}},readoutNode):null,!sh("graph")?html(Graph,{series:series,width:L.graphW,height:LAYOUT_K.MINI-AXIS_H,yTicks:2,hoverT:state.hoverT,markT:state.mark&&state.mark.t>=(rawSeries.length?rawSeries[0].t-1:0)?markT:null,onHover:onHoverPt,onPick:onPickPt}):html("div",{style:{marginTop:4}},focusName?html("div",null,html("div",{className:rowFlex,style:{marginBottom:3}},html("span",{className:tabBtn,style:{paddingLeft:0},title:"back to every sector side by side",onClick:()=>dispatch({type:"SET_SECTOR_FOCUS",name:null})},"\u2039 all sectors"),(()=>{const times=sectorData.t;const at=activeT!==null&&activeT>=times[0]-1&&activeT<=times[times.length-1]+1?nearestIdx(times,activeT):times.length-1;const mainV=sectorSeriesOf(sectorData,focusName)[at];const wholeV=(sectorData.total||[])[at];return html("span",{className:mono,style:{fontSize:9.5,whiteSpace:"nowrap"}},html(LineKey,{color:C.line}),html("span",{style:{color:C.ink}},focusName==="portfolio"?"whole portfolio":focusName)," ",html("span",{style:{color:upDown(mainV||0)}},pct(mainV)),focusName==="portfolio"?null:html("span",{style:{marginLeft:12}},html(LineKey,{color:C.dim}),html("span",{style:{color:C.dim}},"whole portfolio "),html("span",{style:{color:upDown(wholeV||0)}},pct(wholeV))));})()),html(SectorFocus,{data:sectorData,name:focusName,width:L.graphW,height:L.graphH,hoverT:state.hoverT,markT:markT,onHover:onHoverPt,onPick:onPickPt})):sectorMode?html(SectorGrid,{data:sectorData,width:L.graphW,height:L.graphH,cols:L.sectorCols,hoverT:state.hoverT,markT:markT,scaleMode:state.sectorScale,order:state.sectorOrder,rangeWords:rangeWords,onHover:onHoverPt,onOpen:name=>dispatch({type:"SET_SECTOR_FOCUS",name:name})}):html(Graph,{series:series,width:L.graphW,height:L.graphH,yTicks:L.yTicks,hoverT:state.hoverT,bench:bOn?benchLine:null,boughtT:bt?bt.anchor.t:null,markT:state.mark&&state.mark.t>=(rawSeries.length?rawSeries[0].t-1:0)?markT:null,onHover:onHoverPt,onPick:onPickPt})),sh("graph")&&(sh("graph.notes")||state.dayMsg||sectorMode)?html("div",{className:rowFlex},html("span",{className:(0,_uebersicht.css)(_templateObject185(),mono,C.dim)},sectorMode&&!focusName&&sectorData&&sectorData.t&&sectorData.t.length?axisLabel(sectorData.t[0],sectorData.t[0],sectorData.t[sectorData.t.length-1]):""),html("span",{className:(0,_uebersicht.css)(_templateObject186(),mono,C.dim,L.captionW)},state.dayMsg?html("span",{style:{color:C.amber}},state.dayMsg):focusName?html("span",{title:"today's holdings priced back through time, so a purchase never looks like a gain. Nights and weekends are left out."},"change "+rangeWords,focusName==="portfolio"?"":" · "+focusName+" vs the whole portfolio",hovering?" · click to pin":markT!==null?" · pinned (click again to release)":" · hover or click for a moment in time"):sectorMode?html("span",{title:"today's holdings priced back through time, so a purchase never looks like a gain. Nights and weekends are left out."},"change "+rangeWords+" · ",html("span",{className:linkBtn,style:{fontSize:8},title:"best first: the strongest sector leads. biggest first: ordered by how much you hold",onClick:()=>dispatch({type:"TOGGLE_SECTOR_ORDER"})},state.sectorOrder==="best"?"best first":"biggest first")," · ",html("span",{className:linkBtn,style:{fontSize:8},title:"shared scale: every sector on the same scale, so sizes compare. own scales: each sector fills its box, so shapes show",onClick:()=>dispatch({type:"TOGGLE_SECTOR_SCALE"})},state.sectorScale==="shared"?"shared scale":"own scales")," · click a sector to enlarge it"):readout?html("span",{title:readout.sim?simTip(readout):(readout.asked?"the market was closed on "+readout.asked+", so this is the last day before it. ":"")+"≈ = rebuilt from that moment's market prices and the shares you held then; otherwise recorded live by the widget"},readout.asked?(readout.sim?"nearest to "+fmtDate(readout.asked):"market closed "+readout.asked.slice(5))+" → "+fmtDate(readout.d)+" · ":"",readout.d?"day's end, ":"",readout.sim?"simulated · "+BT_MODE_WORDS[btModeNow]:readout.approx?"≈ from prices":"recorded",readoutPerf&&lastRaw&&readout.t<lastRaw.t?html("span",null," · since then ",html("span",{style:{color:upDown(readoutPerf.gain)}},signedExact(readoutPerf.gain)+" ("+pct(readoutPerf.pct)+")"),Math.abs(readoutPerf.flow)>0.5?" + "+money(readoutPerf.flow)+" added":""):null,hovering||readout.d?"":" · pinned"):plGraph?"p&l vs "+(vsInvested?"the "+money(totals.invested)+" you put in":"what the holdings cost")+" · hover or click for a moment in time":series.length>1?series.some(p=>p.approx)?"hover or click for a moment in time":"hover or click the graph for the value at that moment":""),html("span",{className:(0,_uebersicht.css)(_templateObject187(),mono,C.dim)},sectorMode&&!focusName&&sectorData&&sectorData.t&&sectorData.t.length?axisLabel(sectorData.t[sectorData.t.length-1],sectorData.t[0],sectorData.t[sectorData.t.length-1]):"")):null,simShown&&sh("graph.backtest")?html("div",{className:(0,_uebersicht.css)(_templateObject188(),mono,C.dim)},html("span",{title:"before the first real day (\"you bought here\") the line is today's holdings priced back, drawn lighter:"+"\nas held now = today's share counts carried back; as weighted now = today's percentages, rebalanced monthly"+"\neither way it meets your real value on the day you bought"},"simulated with today's holdings — hindsight flatters this · "),["held","weighted"].map((m,i)=>html("span",{key:m},i?" | ":"",html("span",{className:linkBtn,style:{fontSize:8,color:btModeNow===m?C.ink:C.dim},title:m==="held"?"today's share counts carried back":"today's percentages, rebalanced monthly",onClick:()=>dispatch({type:"SET_BT_MODE",mode:m})},BT_MODE_WORDS[m])))):null,benchCap||benchLine||benchOff||benchCtl||benchNote||lateShown.length||histProg||olderComing?// wraps (13.5): each part keeps its words together, so a narrow window
// breaks the line only at the " · " joints, never inside a word
html("div",{className:(0,_uebersicht.css)(_templateObject189(),mono,C.dim)},html("span",{style:{minWidth:0}},benchOff?html("span",{className:linkBtn,style:{fontSize:8,whiteSpace:"nowrap"},title:"show the "+String(bench&&bench.symbol||benchWantSym||"index")+" line again",onClick:()=>savePref("showBenchmark",true,dispatch)},"show index"):null,benchCap?html("span",{title:"thin grey line: "+String(bench.symbol)+" bought with the same money on the same days as your purchases"+" (prices only — dividends left out on both sides)"+(bench.stale?"\nits latest price is stale":"")+(benchCtl?"\npick another index with \"index ▾\"":bench.source==="setting"?"\nchosen in ⚙ → Portfolio → compare with an index":"\nthe default for "+d.currency+" — change it in ⚙ → Portfolio → compare with an index (none hides it)")},(G.Wu<K.NARROW&&benchCtl?benchCap.leadShort:benchCap.lead).split(" · ").slice(0,-1).map((part,i)=>html("span",{key:"bl"+i,style:{whiteSpace:"nowrap"}},part+" · ")),html("span",{style:{whiteSpace:"nowrap",color:benchCap.diff?upDown(benchCap.diff):C.dim}},G.Wu<K.NARROW&&benchCap.short?benchCap.short:benchCap.verdict)):null,benchNote?html("span",{style:{whiteSpace:"nowrap"},title:benchLoading?"the next refresh fetches its prices (older years follow in the background)":"Yahoo has no prices for "+benchWantSym+" (a typo?) — pick another index"},benchNote):null,(benchCap||benchOff||benchNote)&&(lateShown.length||olderComing||histProg)?html("span",{style:{whiteSpace:"nowrap"}}," · "):null,lateShown.length?html("span",{style:{whiteSpace:"nowrap"},title:lateShown.map(ls=>String(ls.ticker)+" from "+fmtIsoLong(ls.first)).join("\n")+"\nYahoo has no older prices for "+(lateShown.length===1?"it":"them")+", so "+(lateShown.length===1?"its":"their")+" money counts as cash until the first price"},lateShown.length===1?"1 holding starts later":lateShown.length+" holdings start later"):null,lateShown.length&&(olderComing||histProg)?html("span",{style:{whiteSpace:"nowrap"}}," · "):null,olderComing?html("span",{style:{whiteSpace:"nowrap"}},"loading older days\u2026"):null,olderComing&&histProg?html("span",{style:{whiteSpace:"nowrap"}}," · "):null,histProg?html("span",{style:{whiteSpace:"nowrap"},title:"downloading older prices in the background so the graph can reach further back — everything else works as usual meanwhile"+(histProg.current?"\nnow: "+String(histProg.current):"")},"loading history"+histCount+"…"):null),benchLine||benchCtl?// kept in one piece (flex: none), so it is always whole; its own
// flex item, where a plain leading space is dropped: hence the no-break space
html("span",{style:{flex:"none"}},benchCap||benchNote||lateShown.length||olderComing||histProg?"\u00a0· ":"",benchCtl?html("span",{className:linkBtn,style:{fontSize:8,color:state.benchPick?C.ink:C.dim},"data-pw-benchpick":"1",title:"the index to compare with"+(benchWant==="auto"?" (auto: the default for "+d.currency+")":"")+" — click to pick another, or none",onClick:()=>dispatch({type:"BENCH_PICK"})},"index: "+(benchWant==="none"?"none":benchWantSym)+" ▾"):null,benchCtl&&benchLine?" · ":null,benchLine?html("span",{className:linkBtn,style:{fontSize:8},title:"hide the index line (remembered in _settings.showBenchmark)",onClick:()=>savePref("showBenchmark",false,dispatch)},"hide"):null):null):null,bOn&&benchCtl&&state.benchPick?html(BenchPicker,{want:benchWant,cur:d.currency,hidden:!showBenchOf(state),state:state,dispatch:dispatch}):null,sh("graph")&&focusName&&focusName!=="portfolio"?(()=>{// what's in the enlarged sector: its stocks, best first (click one for its own chart)
const names={};(sectorData&&sectorData.themes||[]).forEach(th=>{names[th.name]=true;});const inSector=positions.filter(q=>q.theme===focusName||focusName==="Other"&&!names[q.theme]);const perStock=!from&&RANGES.indexOf(effRange)>=0;// per-stock changes exist for 1H…1Y only
const chgOf=q=>perStock?changeFor(q,effRange):q.dayChangePct;const rowsIn=inSector.slice().sort((a,b)=>(chgOf(b)||0)-(chgOf(a)||0));return html("div",{style:{marginTop:5,display:"flex",flexWrap:"wrap",alignItems:"baseline",columnGap:"10px",rowGap:"2px"}},html("span",{className:eyebrow,style:{whiteSpace:"nowrap"}},rowsIn.length+" holdings · "+(perStock?effRange:"today")),rowsIn.slice(0,14).map(q=>html("span",{key:q.ticker,className:mono,title:(q.name||q.ticker)+" — click for its chart",style:{fontSize:9.5,cursor:"pointer",whiteSpace:"nowrap"},onClick:()=>openStock(q.ticker,dispatch,state)},q.ticker," ",html("span",{style:{color:upDown(chgOf(q)||0)}},pct(chgOf(q))))),rowsIn.length>14?html("span",{className:(0,_uebersicht.css)(_templateObject190(),mono,C.dim)},"+",rowsIn.length-14," more"):null);})():null):null,nCols?html("div",{className:colsGap?(0,_uebersicht.css)(_templateObject191(),sectionGap,cols):cols},L.cols.map((c,i)=>html("div",{key:i,className:colClass(i),style:colStyle(i),"data-pw-col":i,"data-pw-w":Math.floor(L.colW[i]),"data-pw-panel":"col"+i,"data-pw-est":c.reduce((h,u,j)=>h+(j?K.GAP:0)+L.est[u.key],0)},c.map((u,j)=>unitNode(u,j===0))))):null,footerBlock),hover);};// A window's view of the state: the shared keys plus its own (WIN_KEYS), and
// _win / _disp for frame() and the display-aware clicks. Its events carry its
// id (`w`), so updateState files them under wins[id].
const renderWindow=(state,win,i,n,disp,dispatch)=>{const ws=Object.assign({},state,state.wins[win.id]||WIN_INITIAL,{_win:Object.assign({},win,{idx:i,n:n}),_disp:disp||null});if(disp){ws.compact=win.compact===true;ws.graphBig=win.graphBig===true;}const wd=ev=>dispatch(Object.assign({w:win.id},ev));wd.w=win.id;return renderWin(ws,wd);};let mediaHook=null;// {dispatch}: one prefers-color-scheme listener for the widget
const armMediaHook=dispatch=>{if(mediaHook){mediaHook.dispatch=dispatch;return;}mediaHook={dispatch:dispatch};try{const mq=window.matchMedia("(prefers-color-scheme: light)");const fn=()=>{if(mediaHook)mediaHook.dispatch({type:"THEME_MEDIA"});};if(mq.addEventListener)mq.addEventListener("change",fn);else if(mq.addListener)mq.addListener(fn);}catch(e){/* no matchMedia: the theme follows the saved setting only */}};const render=(stateIn,dispatch)=>{const state0=sane(stateIn);const state=state0.wins&&typeof state0.wins==="object"?state0:merge(state0,{wins:{}});THEME_NOW=themeOf(state);armMediaHook(dispatch);const disp=displayOf(state);const all=windowsOf(state,disp);// until there is data (starting, setup, an error) only the first window shows
const wins=state.raw&&state.raw.data?all:all.slice(0,1);const frames=wins.map((win,i)=>renderWindow(state,win,i,wins.length,disp,dispatch));armEditKeys(hasData(state)&&Object.keys(state.wins).some(id=>state.wins[id]&&state.wins[id].editOpen),dispatch);return frames.length===1?frames[0]:html("div",{"data-pw-wins":frames.length},frames);};exports.render=render;

},{"uebersicht":"uebersicht"}],"uebersicht":[function(require,module,exports){
"use strict";

// what `import { css, run } from "uebersicht"` gets in the web demo
module.exports = require("./web-runtime.js");

},{"./web-runtime.js":22}]},{},[21]);
