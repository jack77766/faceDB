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


 //Category and Subcategory for DB and blobnames
 const category = 'FBIMostWanted';
 const subcategory = 'Fugitives';
 const containerName = 'watchlist';





// //LOCAL SQL DB CONNECTION 

// const db = mysql.createConnection({
//    host     : 'localhost',
//    user     : 'root',
//    database : 'facedb'
//  });


//freesqldatabase.com DB CONNECTION
 const db = mysql.createConnection({
    host     : 'sql7.freesqldatabase.com',
    user     : 'sql7277473',
    password : 'ijHXQEEUik',
    port     :  3306,
    database : 'sql7277473'
  });
 

  const tableName = 'watchlist';

 db.connect((err) => {
   if(err) throw err;
   else {
      console.log("MySQL Connected")
      
    //   createTable();

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


async function createTable() {
    let sql = 'CREATE TABLE '+ tableName + '(id int AUTO_INCREMENT, name VARCHAR(255), category VARCHAR(255), subcategory VARCHAR(255), url VARCHAR(255), PRIMARY KEY(id))';
        db.query(sql, (err, result) => {
            if(err) throw err;
            console.log(result);
            console.log('Suspects table created...');
    });
}



const c = new Crawler({
    callback: async function(error, res, done) {
        if (error) {
            console.log({error})
        } else {
            // console.log(res.$("title").text());
            const tag = '.portal-type-person div img';
            const images = res.$(tag);
            // images.each((image) => console.log('You have an image: ' + image))
            // images.each(index => {
            //     // here you can save the file or save them in an array to download them later
            //     var name = images[index].attribs.alt.toString()
            //         .replace(/"/g, '') //remove quotes(")
            //         .replace(/\s+/g, '-'); //change spaces for (-)
            //     saveImageToDisk(images[index].attribs.src, './faces/' + name + '.jpg')

            //     // console.log({
            //     //     src: images[index].attribs.src,
            //     //     alt: images[index].attribs.alt,
            //     // })
            // })
            //TESTING WITH SINGLE UPLOAD
            var name = images[4].attribs.alt.toString()
            name = name.replace(/\s+/g, '-').replace(/"/g, ''); 
            let imgURL = images[4].attribs.src;
            let localFilePath  = './faces/' + name + '.jpg';
            console.log("Calling save image to disk with url: " + imgURL + " and filePath : " + localFilePath)
            await saveImageToDisk(imgURL, localFilePath);
        }
      
    }
});

 c.queue('https://www.fbi.gov/wanted/fugitives');

 



async function saveImageToDisk(url, localFilePath) {
    var destination = fs.createWriteStream(localFilePath);
    var request = https.get(url, function(response) {
      response.pipe(destination);
    });
    //UPLOAD TO BLOB
    console.log("Calling uploadToBlob with filePath: " + localFilePath)
    await uploadToBlob(localFilePath);

}


async function uploadToBlob(localFilePath) {


    //ACTIVATE CREDENTIALS AND CONTAINER
    const credentials = new SharedKeyCredential(STORAGE_ACCOUNT_NAME, ACCOUNT_ACCESS_KEY);
    const pipeline = StorageURL.newPipeline(credentials);
    const serviceURL = new ServiceURL(`https://${STORAGE_ACCOUNT_NAME}.blob.core.windows.net`, pipeline);
    const containerURL = ContainerURL.fromServiceURL(serviceURL, containerName);  
    console.log("Container URL: " + containerURL.url)
    const aborter = Aborter.timeout(30 * ONE_MINUTE);

    // Create container if exists catch error.
    // try{
    //     await containerURL.create(aborter);
    //     console.log(`Container: "${containerName}" is created`);
    // }
    // catch(err) {
    //     console.log(err.message);
    // }

    //UPLOAD IMAGE
    var blobName = localFilePath.substring(localFilePath.lastIndexOf('/') + 1 );
    // fileName = fileName.replace(/\s/gi, '-')
    console.log("Calling upload image with filePath: " + localFilePath + " and name: " + blobName)
    await uploadImage(aborter, containerURL, localFilePath, blobName)


}

//UPLOAD IMAGE NO-STREAM
async function uploadImage(aborter, containerURL, filePath, blobName) {
    try {
        filePath = path.resolve(filePath);

        // var fullBlobName = category + "/" + subcategory + "/" + blobName;
        // randomBlobName = 
        console.log("Getting blockBlorURL with containerURL: " + containerURL.url 
                            + " and blobName: " + blobName)
        const blockBlobURL = BlockBlobURL.fromContainerURL(containerURL, blobName);
        console.log("Blob created, URL is: " + JSON.stringify(blockBlobURL.url));

        // addToDB(blobName, blockBlobURL.url);
        
        console.log("Calling uploadFileToBlockBlob with filePath: " + filePath + 
                    " and blobURL: "+blockBlobURL.url)
        return await uploadFileToBlockBlob(aborter, filePath, blockBlobURL);
    }
    catch(err) {
        console.log(err)
    }
}

//UPLOAD IMAGE USING STREAM
// async function uploadImage(aborter, containerURL, filePath, blobName) {
//     try{ 
//     filePath = path.resolve(filePath);

//     // var fullBlobName = category + "/" + subcategory + "/" + blobName;
//     const blockBlobURL = BlockBlobURL.fromContainerURL(containerURL, blobName);
//     console.log("Blob created, URL is: " + JSON.stringify(blockBlobURL.url));

//     const stream = fs.createReadStream(filePath, {
//       highWaterMark: FOUR_MEGABYTES,
//     });

//     const uploadOptions = {
//         bufferSize: FOUR_MEGABYTES,
//         maxBuffers: 5,
//     };


//     // //SAVE URL TO DB
//     // addToDB(blobName, blockBlobURL.url);

//     console.log("JERE")

//     return await uploadStreamToBlockBlob(
//                     aborter, 
//                     stream, 
//                     blockBlobURL, 
//                     uploadOptions.bufferSize, 
//                     uploadOptions.maxBuffers);
//   } catch (err) {console.log(err)}
// }


async function addToDB(name, url) {
    //REGULAR SQL SYNTAX


    let post = {name:name, category: category, subcategory: subcategory, url:url};
    let sql = 'INSERT INTO ' + tableName + ' SET ?';
    let query = db.query(sql, post, (err, result) => {
        if(err) throw err;
        console.log(result);
        console.log('Suspect ' +  name + ' added...');
    });

}




// app.listen(process.env.PORT, process.env.IP, (req,res) => {
//     console.log("Azure-blobs server started!!!")
// })