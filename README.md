# JobjeS

# Version Information

* Initial Version -- 1.0.1

* 1.1.0
    * Functions
* 1.2.0
    * Filters

## Introduction
JobjeS is short for JavaScript Object Search.  It is a query language for validating and searching array and object structures within JavaScript.

## Installation
To install from NPM, use `npm i jobjes`.

## Usage
This library allows regular expression like queries to be executed against an arbitrary array or object literal structure and return any items that match the query.
 
There are three key terms in the way queries are executed:
* Selects:
    * A select is anything that moves the context forward.  This is limited to paths. (i.e. sequences of references to properties, termed keys, within the structure)

    * e.g. given the object `{ set: [ 1, 2, 3, 4 ], id: 'first' }` `set` and `id` are keys in the immediate context.  So are `1`, `2`, `3`, and `4` within the context of the array under `'set'`.
* Conditions:
    * A condition is anything that is used to filter results.  

    * They come in two forms:
        * Full:
            * A full condition is a key followed by a divider (default ':') and then a value item.  (more on that later).  

            * When executing a full condition, the value item is evaluated against the content of the given key without altering the context.
        * Nested:
            * A nested condition is a value item, whether following an operator or separator.  (more on those later).

            * When executing a nested condition, the value item is evaluated against the current context.
         
    * All conditions limit the context of operations that follow them, but do not act as selects.
* Parentheticals:
    * A parenthetical, i.e. operations within parenthesis, executes under the originating context, but any changes it makes to context are limited in scope to it.  This means that any selects that occur within it are forgotten when leaving the parenthesis.

    * Parentheticals can be nested "infinitely".  Heaps do exist.

## Definitions
Below are the selects within the system:
* `<key>` : 
    * any direct reference to a property name is termed a `"key"`, and will only match that key.  Within the current context, this will move the execution context to the content of that key.  Meaning that given the structure, `{ set: [ 1, 2, 3, 4 ], id: 'first' }`, the key `'set'` will result in the context moving to the array under set.  i.e. `[ 1, 2, 3, 4 ]`.

* `*` : 
    * This select matches "any" key.  Meaning, within the structure, `{ set: [ 1, 2, 3, 4 ], id: 'first' }`, the `*` select would match the content of both `'set'` and `'id'`.
 
* `**` : 
    * This select atches "any and all".  It does the same thing as `*`, but to every possible depth, traversing the entire structure and executing subsequent query details against each sub item.  Obviously, this is massively costly in terms of relative execution time, especially in large structures.

* Function : 
    * A function call follows the form `<key>;<parameter tag>`.  A `<parameter tag>` is a term, provided as a parameter as seen in the accompanying examples, that is a reference to the parameter array for the function.  If the function does not require parameters, this should be omitted.  Functions can be used as normal selects and as the left part of a full condition.  


* Filter : 
    * A filter is identical to a full condition except that it acts like a select.  Filters advance the context.  Filters replace the normal divider (default: ':') with a number symbol '#'.
 
Below are the value items within the system:
* Note that all definitions below are full conditions.  To convert them into nested conditions, simply remove the key and divider (default ':').
 
* `<key>:!!` : 
    * exists, checks to see if the given `<key>` is defined on the object
 
*  `<key>:!` : 
    * does not exist, checks to see if the given `<key>` is not defined on the object. (never matches as a nested, because the context must exist prior to it getting evaluated)
 
* `<key>:!!<value>` : 
    * positive value, checks to see if the given `<key>` has the given value
 
* `<key>:!<value>` : 
    * negative value, checks to see if the given `<key>` does not have the given value
 
* `<key>:/regexp/` : 
    * regular expression, checks to see if the given `<key>`'s value matches the regular expression
 
To connect conditions and parentheticals, operators can be used.  The following operators are supported:
* `&&` : Ensures that all conditions / parentheticals in the chain evaluate as true.
* `||` : Ensures that at least one of the conditions / parentheticals in the chain evaluate as true.
 
## Import Final Note
When using this system, context is massively important.  If the results you get aren't what you expected, consider context.

## Some Examples

Given the structure:

```
const obj = {
    'func': () => { return { "greeting": "hi!", "action": { "jump": "10 feet" } } },
    'tests': [
        {
            'label': 'Test',
            'outcome': true,
            'projects': {
                'duration': 'two weeks',
                'personnel': '4',
                'leader': 'Jared'
            }
        },
        {
            'label': 'Test2',
            'outcome': false,
            'projects': {
                'duration': 'a week',
                'personnel': '7',
                'leader': 'Scott'
            }
        },
        {
            'label': 'Test3',
            'outcome': false,
            'projects': {
                'duration': 'eight days',
                'personnel': '2',
                'leader': 'Jared'
            }
        },
        {
            'label': 'Test4',
            'outcome': true,
            'jump': (height) => { return { "sound": "hup!", "height": height }; }
        }
    ],
    'seasons': {
        'winter': {
            'temperature': 'freezing',
            'duration': 'a few months',
            'activities': [
                'skiing',
                'snowboarding'
            ]
        },
        'spring': {
            'temperature': 'cold',
            'duration': 'a few months',
            'activities': [
                'hiking',
                'kyaking'
            ]
        },
        'summer': {
            'temperature': 'hot',
            'duration': 'a few months',
            'activities': [
                'hiking',
                'running',
                'kyaking'
            ]
        },
        'autumn': {
            'temperature': 'chilly',
            'duration': 'a few months',
            'activities': [
                'hiking',
                'dirtbiking'
            ]
        }
    }
}
```

The following queries will result in their specified outcomes:
```
let tests = [];

// below is an example of the new filter functionality.
// result: Test and Test4, either the content of the label field (first example) or the container object (second example)
tests.push(JobjeS.where('tests.*.label#(\'Test\'||\'Test4\')', obj));
tests.push(JobjeS.where('tests.*.label:(\'Test\'||\'Test4\')', obj));

// result: { 'label': 'Test4', 'outcome': true, 'jump': *function* }
tests.push(JobjeS.where('tests.3.jump;\'test\':/a week/', obj, { "test": ['a week'] }));

// result: undefined (see the function it's calling and note that it is not providing a parameter)
tests.push(JobjeS.where('tests.3.jump;.height', obj));

// result: '10 feet'
tests.push(JobjeS.where('func;.action.jump', obj));

// result: 2
tests.push(JobjeS.where('tests.2.projects.personnel', obj));

// result: nothing
tests.push(JobjeS.where('tests.2.projects.duration:\'a week\'.personnel', obj));

// result: 2
tests.push(JobjeS.where('tests.2.(projects.duration:\'eight days\').projects.personnel', obj));

// result: 7
tests.push(JobjeS.where('tests.*.(projects.duration:\'a week\').projects.personnel', obj));

// result: the entire object
tests.push(JobjeS.where('(tests.2.projects.personnel:!!)', obj));

// result: no match (nothing)
tests.push(JobjeS.where('tests.2.projects.personnel.!', obj));

// result: { 'duration': 'a week', 'personnel': '7', 'leader': 'Scott' }
tests.push(JobjeS.where('tests.1.projects.personnel:\'4\'||\'7\'', obj));

// result: 7, 2
tests.push(JobjeS.where('tests.*.(projects.duration:\'a week\')||(projects.duration:\'eight days\').projects.personnel', obj));

// results: everything
tests.push(JobjeS.where('((seasons.winter:!!)||(seasons.spring:!!))', obj));

// result: everything
tests.push(JobjeS.where('(seasons.winter:!!||spring:!!)', obj));

// result: nothing
// why, when the others return everything?
//
// Paths and Conditions are considered separately:
// the second condition has the seasons path prior to spring condition, but the first path (i.e. seasons) preceding 
// winter has already taken affect.  This means that the second path is looking for seasons.seasons, which doesn't exist.  
// Because it cannot find that path, it fails to change the context, which supercedes the condition 
//  (i.e. spring:!!) and causes the parenthetical to fail as a whole, returning false.
tests.push(JobjeS.where('(seasons.winter:!!||seasons.spring:!!)', obj));
```