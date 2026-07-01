# JobjeS

# Version Information

* Initial Version -- 1.0.1

* 1.1.0
    * Functions
* 1.2.0
    * Filters
* 1.3.0
    * Subqueries and post query operators
* 1.4.0
    * The array select `@` and conversions    
    * Properly implemented the `**` operator
    * Revamped `>` and `<` query operators to be more consistent.  
        * Note: 
            * they aren't capable of altering context
            * they only find the closest (immediate or direct parent) object when doing their task
    * Keys are no longer prohibited from matching JavaScript keywords.

## Introduction
JobjeS is short for JavaScript Object Search.  It is a query language for validating and searching array and object structures within JavaScript.

## Installation
To install from NPM, use `npm i jobjes`.

## Usage
This library allows regular expression like queries to be executed against an arbitrary array or object literal structure and return any items that match the query.

Queries are broken up into subqueries.  These can be defined explicitly with square brackets (`[` and `]`) or implicitly (they are used behind the scenes anyway).  Multiple queries can be executed in sequence (note that context resets between subqueries) via the sequence operator `,` and merge operator `+`.  The merge operator concatenates results between the merged queries, but otherwise does not modify them.  The sequence operator carries each set as its own array.
 
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
    * This select matches "any and all".  It does the same thing as `*`, but to every possible depth, traversing the entire structure and executing subsequent query details against each sub item.  Obviously, this is massively costly in terms of relative execution time, especially in large structures.

* `@` : 
    * This select matches "any array" key.  This functions identically to '*' except that it does not match objects.  

* Function : 
    * A function call follows the form `<key>;<parameter tag>`.  A `<parameter tag>` is a term, provided as a parameter as seen in the accompanying examples, that is a reference to the parameter array for the function.  If the function does not require parameters, this should be omitted.  Functions can be used as normal selects and as the left part of a full condition.  


* Filter : 
    * A filter is identical to a full condition except that it acts like a select.  Filters advance the context.  Filters replace the normal divider (default: ':') with a number symbol '#'.

    
*  Conversion: 
    * A conversion is a block, marked by a pair of curly brackets, `{` and `}`, and populated by conversion operations.  They build an object literal(s) that then becomes the context.  What follows is a description of the conversion operations.
        * `+>` : Inclusions follow the pattern `[subquery]+>[pathrun]`, where the `subquery` retrieves value(s) which are inserted into the resulting object at the given `pathrun` location.
        * `->` : Blocks remove the provided `pathrun` from the resulting object literal.  They follow this pattern: `[pathrun]->`.
        * `!!>` : If found operations follow this pattern: `[subquery]!!>[subquery] or [value],[pathrun]`.  They execute the first `subquery`, and if they find something, they execute the second `subquery` and use the result, or the literal value, and place it at the `pathrun` in the resulting object literal.
        * `!>` : If not found operations follow this pattern: `[subquery]!>[subquery] or [value],[pathrun]`.  They execute the first `subquery`, and if they do not find something, they execute the second `subquery` and use the result, or the literal value, and place it at the `pathrun` in the resulting object literal.  
 
    * Note: Any existing path that contains a single value (number, string, etc) that is updated, will be overwritten.
    * Note: By default, all conversion operations are required to succeed for anything to be returned, but they can be made individually optional by immediately preceding the operator with a dash (`-`).
    * Note: By default, conversions start empty and are filled by the user.  You can make them "inclusive", (i.e. automatically copy all properties that are not accounted for by explicit conversion operations over afterward), by adding a plus, `+`, just inside of the opening curly bracket, `{`.
 
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
* `&&` : 
    * Ensures that all conditions / parentheticals in the chain evaluate as true.
* `||` : 
    * Ensures that at least one of the conditions / parentheticals in the chain evaluate as true.

Subqueries support post operators.  They are placed immediately following the query itself.  They support the following:
* `>` :
    * The `>` post operator maintains the state of object results from queries.  This will, for example, return a clean array of objects from the `*` operator, rather than every object and its properties.
* `<` :
    * The `<` post operator enumerates the query results. This, for example, will return an array of the properties in an object literal rather than the object itself.
 
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
// Some query examples
{
    // result: 2
    const simpleExample1 = JobjeS.where('tests.2.projects.personnel', obj);

    // result: nothing
    // reason: the 3rd object in the tests property array has a projects.duration value of 'eight days', not 'a week'.
    const simpleExample2 = JobjeS.where('tests.2.projects.duration:\'a week\'.personnel', obj);

    // result: 2
    const simpleExample3 = JobjeS.where('tests.2.(projects.duration:\'eight days\').projects.personnel', obj);

    // result: 7
    const simpleExample4 = JobjeS.where('tests.*.(projects.duration:\'a week\').projects.personnel', obj);

    // result: the entire object
    const simpleExample5 = JobjeS.where('(tests.2.projects.personnel:!!)', obj);

    // result: no match (nothing)
    const simpleExample6 = JobjeS.where('tests.2.projects.personnel.!', obj);

    // result: { 'duration': 'a week', 'personnel': '7', 'leader': 'Scott' }
    const simpleExample7 = JobjeS.where('tests.1.projects.personnel:\'4\'||\'7\'', obj);

    // result: 7, 2
    const simpleExample8 = JobjeS.where('tests.*.(projects.duration:\'a week\')||(projects.duration:\'eight days\').projects.personnel', obj);

    // results: everything
    const simpleExample9 = JobjeS.where('((seasons.winter:!!)||(seasons.spring:!!))', obj);

    // result: everything
    const simpleExample10 = JobjeS.where('(seasons.winter:!!||spring:!!)', obj);

    // result: nothing
    // why, when the others return everything?
    //
    // Paths and Conditions are considered separately:
    // the second condition has the seasons path prior to spring condition, but the first path (i.e. seasons) preceding 
    // winter has already taken affect.  This means that the second path is looking for seasons.seasons, which doesn't exist.  
    // Because it cannot find that path, it fails to change the context, which supercedes the condition 
    //  (i.e. spring:!!) and causes the parenthetical to fail as a whole, returning false.
    const simpleExample11 = JobjeS.where('(seasons.winter:!!||seasons.spring:!!)', obj);
}

// Subquery and post operator examples
{
    // baseline (to show what you would get without the post operators)
    const subqueryBase1 = JobjeS.where('[tests.*],[seasons.autumn]', obj);
    const subqueryBase2 = JobjeS.where('tests.*,seasons', obj);
    const subqueryBase3 = JobjeS.where('[tests.*],seasons', obj);

    // a jobjes call can make multiple queries at once.  below are examples of doing that (along with the post query operators):
    const subqueryBasic = JobjeS.where('[tests.*],[seasons]', obj);
    const subqueryPost1 = JobjeS.where('tests.*<,seasons', obj);

    const subqueryPost2 = JobjeS.where('[tests.*]>,[seasons]<', obj);
    const subqueryPost3 = JobjeS.where('tests.*>,seasons<', obj);

    const subqueryPost4 = JobjeS.where('tests.*>,[seasons]<', obj);
}

// Wildcard examples
{
    // note that the parenthetical at the end is executed against the objects themselves, but doesn't change the context
    // this results in the objects getting passed as the result, instead of the key set
    // this is another way to achieve post operation like behavior

    // all of these match, but do so in different ways

    // * matches anything
    const wildcardAny = JobjeS.where('tests.*.(label)', obj);

    // @ only matches arrays
    const wildcardArray = JobjeS.where('tests.@.(label)', obj);

    // ** matches anything to any depth 
    // (meaning, it will flatten out the entire structure and let you query against all of it at once)
    const wildcardAnyAtAll = JobjeS.where('tests.**.(label)', obj);
}

// Filter vs Condition examples
{
    // result: Test and Test4, either the content of the label field (first example) or the container object (second example)
    const filterExample = JobjeS.where('tests.*.label#(\'Test\'||\'Test4\')', obj);
    const conditionExample = JobjeS.where('tests.*.label:(\'Test\'||\'Test4\')', obj);
}

// Function examples
{
    // a function and return its result
    const standaloneFunctionCall = JobjeS.where('func;.*>', obj);

    // result: { 'label': 'Test4', 'outcome': true, 'jump': *function* }
    const functionWithParameter = JobjeS.where('tests.3.jump;\'test\':/a week/', obj, { "test": ['a week'] });

    // result: undefined (see the function it's calling and note that it is not providing a parameter)
    const functionInPathrun1 = JobjeS.where('tests.3.jump;.height', obj);

    // result: '10 feet'
    const functionInPathrun2 = JobjeS.where('func;.action.jump', obj);
}

// Conversion examples
{
    const conversion1 = JobjeS.where('tests.*>{label+>source,outcome+>verified,projects.duration+>time.length}', obj);
    const conversion2 = JobjeS.where('tests.*>{label+>source,outcome+>verified,projects.duration+>time.length,time.length->}', obj);

    // why doesn't this work?
    // this doesn't work because conversions return clean result sets, instead of query work sets (like everything else)
    // this means that before the result of a conversion can be queried, the work items need to be generated
    // the '*' selector matches anything and generates work items, 
    //      so placing '.*.' between the 'source' key and the conversion will allow querying to function as expected
    const conversion3 = JobjeS.where('tests.*{label+>source,outcome+>verified,projects.duration+>time.length}.source', obj);
    const conversion4 = JobjeS.where('tests.*{label+>source,outcome+>verified,projects.duration+>time.length}.*.source', obj);

    // this conversion uses a condition to filter the resulting records by limitnig the input
    const conversion5 = JobjeS.where('{**.(projects.personnel:\'4\').label+>source}', obj);

    // by adding a '-' at the start of a conversion operator, the operation becomes optional
    //      meaning, if it fails, the conversion still continues
    const conversion6 = JobjeS.where('tests.@.{label+>name,projects.personnel-+>headcount,projects.personnel-!>\'N/A\',headcount}', obj);
    const conversion7 = JobjeS.where('tests.@.{label+>name,projects.personnel-!>\'N/A\',headcount,projects.personnel-!!>\'Found\',headcount,headcount->}>', obj);
}
```