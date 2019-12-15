/* Copyright 2017 Mozilla Foundation
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

var Canvas = require('canvas');
var assert = require('assert');
var fs     = require('fs');

function NodeCanvasFactory() {}
NodeCanvasFactory.prototype = {
    create: function NodeCanvasFactory_create(width, height) {
        assert(width > 0 && height > 0, 'Invalid canvas size');
        var canvas = Canvas.createCanvas(width, height);
        var context = canvas.getContext('2d');
        return {
            canvas: canvas,
            context: context,
        };
    },

    reset: function NodeCanvasFactory_reset(canvasAndContext, width, height) {
        assert(canvasAndContext.canvas, 'Canvas is not specified');
        assert(width > 0 && height > 0, 'Invalid canvas size');
        canvasAndContext.canvas.width = width;
        canvasAndContext.canvas.height = height;
    },

    destroy: function NodeCanvasFactory_destroy(canvasAndContext) {
        assert(canvasAndContext.canvas, 'Canvas is not specified');
        // Zeroing the width and height cause Firefox to release graphics
        // resources immediately, which can greatly reduce memory consumption.
        canvasAndContext.canvas.width = 0;
        canvasAndContext.canvas.height = 0;
        canvasAndContext.canvas = null;
        canvasAndContext.context = null;
    },
};

var pdfjsLib = require('pdfjs-dist');
// tesseract.js@^2.0.0-beta.1
const { createWorker } = require('tesseract.js');

// Relative path of the PDF file.
var pdfURL = '/Users/admin/data/invoices-data/data03/0000E518.pdf';
const WRITE_PAGES_TO_PNG = true;
const OCR_LANGS = 'deu+eng';
const OCR_ENABLED = false;
const VIEWPORT_SCALE = 2.4;
var pages = [];

// Read the PDF file into a typed array so PDF.js can load it.
var rawData = new Uint8Array(fs.readFileSync(pdfURL));

const worker = createWorker();
(async ()=> {
    await worker.load();
    await worker.loadLanguage( OCR_LANGS );
    await worker.initialize( OCR_LANGS );
    console.log('worker initialized');
    loadPDFFile();
})();

// Load the PDF file.
function loadPDFFile() {
    var loadingTask = pdfjsLib.getDocument(rawData);
    loadingTask.promise.then(function(pdfDocument) {
        console.log('# PDF document loaded.');
        //How many pages it has
        numPages = pdfDocument.numPages;
        // Get the first page.
        getPDFPage( pdfDocument, 1, numPages );
    }).catch(function(reason) {
        console.log(reason);
    });
}

function getPDFPage( pdfDocument, num, numPages ) {
    if ( num > numPages ) {
        return;
    }
    console.log('---------------------------');
    console.log('getPDFPage: ' + num + '/' + numPages);
    pdfDocument.getPage( num ).then(function (page) {
        // Render the page on a Node canvas with 100% scale.
        var viewport = page.getViewport({ scale: VIEWPORT_SCALE });
        var canvasFactory = new NodeCanvasFactory();
        var canvasAndContext = canvasFactory.create( viewport.width, viewport.height );
        console.log('viewport.width: ' + viewport.width);
        console.log('viewport.height: ' + viewport.height);
        console.log('---------------------------');
        var renderContext = {
            canvasContext: canvasAndContext.context,
            viewport: viewport,
            canvasFactory: canvasFactory,
        };
        var renderTask = page.render(renderContext);
        renderTask.promise.then(function() {
            // Convert the canvas to an image buffer.
            var image = canvasAndContext.canvas.toBuffer();
            pages[ num - 1 ] = image;
            if ( WRITE_PAGES_TO_PNG ) {
                fs.writeFile('output_page_' + num + '.png', image, function (error) {
                    if (error) {
                        console.error('Error: ' + error);
                    } else {
                        console.log( 'Finished converting page ' + num + ' of PDF file to a PNG image.' );
                    }
                });
            }
            (async ()=> {
                if ( OCR_ENABLED ) {
                    const { data: { text } } = await worker.recognize(image);
                    console.log(text);
                }
                getPDFPage( pdfDocument, num + 1, numPages );
            })();
        });
    });
}
