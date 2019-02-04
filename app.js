const express = require('express'),
      app     = express(),
      mysql   = require('mysql'),
      fs      = require("fs"),
      path    = require("path"),
      Crawler = require("crawler"),
      https   = require('https')

const {
    Aborter,
    BlockBlobURL,
    ContainerURL,
    ServiceURL,
    SharedKeyCredential,
    StorageURL,
    uploadStreamToBlockBlob,
    uploadFileToBlockBlob
} = require('@azure/storage-blob');


if (process.env.NODE_ENV !== "production") {
    require("dotenv").config();
}

app.set('view engine', 'ejs');
app.use(express.static(__dirname + '/public'));


//DB CONNECTION
app.use(express.static(__dirname + '/public'));

const db = mysql.createConnection({
   host     : 'trafficintserver.database.windows.net',
   user     : 'dbmassa@trafficintserver',
   port     : 1433,
   password : 'Happy1234',
   database : 'facedb'
 });

 

 db.connect((err) => {
   if(err) throw err;
   else {
      console.log("MySQL Connected")
   }
})

const STORAGE_ACCOUNT_NAME = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const ACCOUNT_ACCESS_KEY = process.env.AZURE_STORAGE_ACCOUNT_ACCESS_KEY;

const ONE_MEGABYTE = 1024 * 1024;
const FOUR_MEGABYTES = 4 * ONE_MEGABYTE;
const ONE_MINUTE = 60 * 1000;

async function showContainerNames(aborter, serviceURL) {

    let response;
    let marker;

    do {
        response = await serviceURL.listContainersSegment(aborter, marker);
        marker = response.marker;
        for(let container of response.containerItems) {
            console.log(` - ${ container.name }`);
        }
    } while (marker);
}

async function uploadLocalFile(aborter, containerURL, filePath) {

    filePath = path.resolve(filePath);

    const fileName = path.basename(filePath);
    const blockBlobURL = BlockBlobURL.fromContainerURL(containerURL, fileName);

    return await uploadFileToBlockBlob(aborter, filePath, blockBlobURL);
}



async function showBlobNames(aborter, containerURL) {

    let response;
    let marker;

    do {
        response = await containerURL.listBlobFlatSegment(aborter);
        marker = response.marker;
        for(let blob of response.segment.blobItems) {
            console.log(` - ${ blob.name }`);
        }
    } while (marker);
}



// saveImageToDisk( 'https://www.fbi.gov/wanted/cei/armando-vargas/@@images/image/preview', './test.jpg');
    

const c = new Crawler({
    callback: function(error, res, done) {
        if (error) {
            console.log({error})
        } else {
            console.log(res.$("title").text());
            const tag = '.portal-type-person div img';
            const images = res.$(tag);
            // images.each((image) => console.log('You have an image: ' + image))
            images.each(index => {
                // here you can save the file or save them in an array to download them later
                var name = images[index].attribs.alt.toString()
                    .replace(/"/g, '') //remove '"'
                    .replace(/\s+/g, '-'); //change spaces for '-'
                saveImageToDisk(images[index].attribs.src, './faces/' + name + '.jpg')

                // console.log({
                //     src: images[index].attribs.src,
                //     alt: images[index].attribs.alt,
                // })
            })
        }
      
    }
});

// c.queue('https://www.fbi.gov/wanted/fugitives');

async function createTable() {
let sql = 'CREATE TABLE suspects(id int AUTO_INCREMENT, name VARCHAR(255), category VARCHAR(255), subcategory VARCHAR(255), url VARCHAR(255), PRIMARY KEY(id))';
    db.query(sql, (err, result) => {
        if(err) throw err;
        console.log(result);
        console.log('Suspects table created...');
});
}

// createTable();

async function addToDB(name, url) {
    let post = {name:name, category:'FBI Most Wanted', subcategory: 'Fugitives', url:url};
    let sql = 'INSERT INTO suspects SET ?';
    let query = db.query(sql, post, (err, result) => {
        if(err) throw err;
        console.log(result);
        console.log('Suspect 1 added...');
    });
}


function saveImageToDisk(url, localPath) {
    var destination = fs.createWriteStream(localPath);
    var request = https.get(url, function(response) {
      response.pipe(destination);
    });
    //UPLOAD TO BLOB
    console.log("sending upload request from: " + localPath)
    uploadToBlob('a00001', localPath)

}


async function uploadToBlob(containerName, localFilePath) {


    //ACTIVATE CREDENTIALS AND CONTAINER
    const credentials = new SharedKeyCredential(STORAGE_ACCOUNT_NAME, ACCOUNT_ACCESS_KEY);
    const pipeline = StorageURL.newPipeline(credentials);
    const serviceURL = new ServiceURL(`https://${STORAGE_ACCOUNT_NAME}.blob.core.windows.net`, pipeline);
    const containerURL = ContainerURL.fromServiceURL(serviceURL, containerName);  
    const aborter = Aborter.timeout(30 * ONE_MINUTE);

    //Create container if exists catch error.
    try{
        await containerURL.create(aborter);
        console.log(`Container: "${containerName}" is created`);
    }
    catch(err) {
        console.log(err.message);
    }

    //UPLOAD IMAGE
    var fileName = localFilePath.substring(localFilePath.lastIndexOf('/') +1);
    // console.log("Creating blob from: " + localFilePath + " with name: " + fileName)
    await uploadImage(aborter, containerURL, localFilePath, fileName)


}


async function uploadImage(aborter, containerURL, filePath, blobName) {

    filePath = path.resolve(filePath);

    const blockBlobURL = BlockBlobURL.fromContainerURL(containerURL, blobName);
    console.log("Blob created, URL is: " + JSON.stringify(blockBlobURL.url));

    const stream = fs.createReadStream(filePath, {
      highWaterMark: FOUR_MEGABYTES,
    });

    const uploadOptions = {
        bufferSize: FOUR_MEGABYTES,
        maxBuffers: 5,
    };

    //SAVE URL TO DB
    addToDB(blobName, blockBlobURL.url);

    

    return await uploadStreamToBlockBlob(
                    aborter, 
                    stream, 
                    blockBlobURL, 
                    uploadOptions.bufferSize, 
                    uploadOptions.maxBuffers);
}


var downloadedContent;
app.get('/', (req,res) => {
    res.render('index', {image:downloadedContent})
})

app.listen(process.env.PORT, process.env.IP, (req,res) => {
    console.log("Azure-blobs server started!!!")
})