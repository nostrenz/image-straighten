/*
Global variables
*/

const INPUTS = document.querySelectorAll(".slider input");
const LOADING = document.getElementById("editor-loading");
const CORNERS_DEBUG = false; // Will display corners detection debug infos if true

// Sliders
INPUTS.forEach(input => input.addEventListener("click", handleUpdate));
INPUTS.forEach(input => input.addEventListener("touchend", handleUpdate));
//INPUTS.forEach(input => input.addEventListener("mousemove", handleUpdate));

// View sizes
const HEADER_HEIGHT = 104;
const TOP_BUTTONS_HEIGHT = 42;
const CONTROLS_HEIGHT_STEP1 = 73;
const CONTROLS_HEIGHT_STEP2 = 191;
var PIXEL_RATIO = (function () {
	var ctx = document.createElement("canvas").getContext("2d");
	var dpr = window.devicePixelRatio || 1;
	var bsr = ctx.webkitBackingStorePixelRatio || ctx.mozBackingStorePixelRatio || ctx.msBackingStorePixelRatio || ctx.oBackingStorePixelRatio || ctx.backingStorePixelRatio || 1;

	return dpr / bsr;
})();

// Filter values
var BRIGHTNESS;
var CONTRAST;
var SATURATION;
var SHARPNESS;
const BRIGHTNESS_DEFAULT = 0;
const CONTRAST_DEFAULT = 1;
const SATURATION_DEFAULT = 1;
const SHARPNESS_DEFAULT = 0;

// Mouse positions
var MOUSE_X;
var MOUSE_Y;

// Canvas
var CANVAS = document.getElementById("canvas");
var CONTEXT = CANVAS.getContext("2d");
const PADDING = 30 * PIXEL_RATIO; // Minimum space between the image and the canvas edges

// Image
var ORIGINAL_PICTURE;
var CROPPED_PICTURE;
var IMAGE_DATA; // Image data as currently displayed on the canvas

// Handles
var HANDLES = [
	{x:0, y:0}, // 0: top-left
	{x:0, y:0}, // 1: top-right
	{x:0, y:0}, // 2: bottom-right
	{x:0, y:0}  // 3: bottom-left
];
var HANDLE_RADIUS = 15 * PIXEL_RATIO;
var HANDLE_COLOR = "rgba(86,206,96,0.7)";
var SELECTED_HANDLE_INDEX = -1; // Index of the currently selected handle from the HANDLES array

// Other variables
var WORKING = false;
var ROTATION = 0;
var ROTATE_ON_CROP = false;

/*
Class definitions
*/

class Picture
{
	constructor(image)
	{
		this.image = image; // Image()
		this.width = this.image.width;
		this.height = this.image.height;
		this.scaleFactor = 1;
		this.originalImageData = null;
		this.posX = 0;
		this.posY = 0;
	}

	/**
	 * This works for rotating the original Image object but can be very slow with big images.
	 * toDataURL() is responsible for this function being so slow.
	 * We can use toDataURL("image/jpeg", 0.7) instead of toDataURL("image/png") but it will alter the image quality with each rotation.
	 *
	 * @param {number} degrees:    0, 90, 180, 270, 360
	 * @param {function} callback: Called once the rotated image is loaded
	 */
	rotate(degrees, callback)
	{
		// No rotation to be done
		if (degrees === 0 || degrees === 360) {
			return callback(false);
		}

		var canvas = document.createElement("canvas");

		if (degrees === 90 || degrees === 270) {
			canvas.width = this.image.height;
			canvas.height = this.image.width;
		} else if (degrees === 180) {
			canvas.width = this.image.width;
			canvas.height = this.image.height;
		}

		var context = canvas.getContext("2d");

		context.save();
		context.translate(canvas.width/2, canvas.height/2);
		context.rotate(degrees * Math.PI/180);
		context.drawImage(this.image, -this.image.width/2, -this.image.height/2, this.image.width, this.image.height);
		context.restore();

		this.image = new Image(canvas.width, canvas.height);
		this.image.src = canvas.toDataURL("image/png");

		this.width = this.image.width;
		this.height = this.image.height;
		this.originalImageData = null;
		this.scaleFactor = 1;
		this.posX = 0;
		this.posY = 0;

		this.image.onload = function() {
			callback(true);
		};
	}

	/**
	 * Calculate size and position values for the image to fit a canvas.
	 *
	 * @param {*} canvas
	 */
	fit(canvas)
	{
		var maxWidth = canvas.width - PADDING;
		var maxHeight = canvas.height - PADDING;

		// Scale the image to fit the canvas
		if (this.image.width > maxWidth || this.image.height > maxHeight) {
			var scaleX = maxWidth / this.image.width;
			var scaleY = maxHeight / this.image.height;

			if (scaleX < scaleY) {
				this.width = Math.round(this.image.width * scaleX);
				this.height = Math.round(this.image.height * scaleX);
				this.scaleFactor = scaleX;
			} else {
				this.width = Math.round(this.image.width * scaleY);
				this.height = Math.round(this.image.height * scaleY);
				this.scaleFactor = scaleY;
			}
		}

		// Center the image in canvas
		if (this.width < canvas.width) {
			this.posX = Math.round((canvas.width / 2) - (this.width / 2));
		}
		if (this.height < canvas.height) {
			this.posY = Math.round((canvas.height / 2) - (this.height / 2));
		}
	}

	/**
	* Get an ImageData object for this image.
	*
	* @param {*} context
	*/
	getImageData(context)
	{
		return context.getImageData(this.posX, this.posY, this.width, this.height);
	}

	getOriginalImageData(context)
	{
		if (this.originalImageData === null) {
			this.originalImageData = this.getImageData(context);
		}

		return this.originalImageData;
	};

	/**
	* Draw this image on a canvas.
	*
	* @param {*} context
	*/
	draw(context)
	{
		context.drawImage(this.image, this.posX, this.posY, this.width, this.height);
	}

	getTopLeftCorner()
	{
		return {x:this.posX, y:this.posY};
	}

	getTopRightCorner()
	{
		return {x:this.posX+this.width, y:this.posY};
	}

	getBottomRightCorner()
	{
		return {x:this.posX+this.width, y:this.posY+this.height};
	}

	getBottomLeftCorner()
	{
		return {x:this.posX, y:this.posY+this.height};
	}
}

class Position
{
	constructor(x, y)
	{
		this.x = x;
		this.y = y;
	}

	fromObject(pos)
	{
		this.x = pos.x;
		this.y = pos.y;

		return this;
	}

	isSmallerThan(other)
	{
		return this.x < other.x && this.y < other.y;
	}

	isGreaterThan(other)
	{
		return this.x > other.x && this.y > other.y;
	}

	isEqualTo(other)
	{
		return this.x === other.x && this.y === other.y;
	}

	isBelowZero()
	{
		return this.x < 0 || this.y < 0;
	}

	distanceFrom(other)
	{
		return distance(this, other);
	}

	angleBetween(other)
	{
		return calculateTwoPointsAngle(this.x, this.y, other.x, other.y);
	}
}

/*
Function definitions
*/

var resetSliders = function()
{
	BRIGHTNESS = brightnessSlider(BRIGHTNESS_DEFAULT);
	CONTRAST = contrastSlider(CONTRAST_DEFAULT);
	SATURATION = saturationSlider(SATURATION_DEFAULT);
	SHARPNESS = sharpnessSlider(SHARPNESS_DEFAULT);
};

document.getElementById("file").onchange = function(e)
{
	// Init
	ORIGINAL_PICTURE = null;
	CROPPED_PICTURE = null;
	IMAGE_DATA = null;
	WORKING = false;
	ROTATION = 0;
	ROTATE_ON_CROP = false;

	resetSliders();
	setStep(1);

	var image = new Image();
	var url = window.webkitURL || window.URL;

	// Data URL
	image.src = url.createObjectURL(e.target.files[0]);

	image.onload = function() {
		/*var orientation = getOrientation(image.src);
		var rotation = orientationToDegress(orientation);*/
		var rotation = false;

		/*CANVAS.width = window.innerWidth;
		CANVAS.height = window.innerHeight;*/

		ORIGINAL_PICTURE = new Picture(image);
		ORIGINAL_PICTURE.fit(CANVAS);
		ORIGINAL_PICTURE.draw(CONTEXT);

		// Define image data
		IMAGE_DATA = ORIGINAL_PICTURE.getOriginalImageData(CONTEXT);

		// The image needs to be rotated
		if (rotation) {
			rotateImage(rotation);
		} else {
			placeHandles(ORIGINAL_PICTURE);
			drawFrame();
		}

		// Show buttons
		var root = document.getElementById("photo-edit");
		root.classList.add("image-loaded");

		console.log("Image " + ORIGINAL_PICTURE.image.width + 'x' + ORIGINAL_PICTURE.image.height + " resized to " + ORIGINAL_PICTURE.width + 'x' + ORIGINAL_PICTURE.height + " (x" + ORIGINAL_PICTURE.scaleFactor + ") at " + ORIGINAL_PICTURE.posX + ',' + ORIGINAL_PICTURE.posY);
	}
}

var placeHandles = function(picture)
{
	// topLeft
	HANDLES[0].x = picture.posX;
	HANDLES[0].y = picture.posY;
	// topRight
	HANDLES[1].x = picture.posX + picture.width;
	HANDLES[1].y = picture.posY;
	// bottomRight
	HANDLES[2].x = picture.posX + picture.width;
	HANDLES[2].y = picture.posY + picture.height;
	// bottomLeft
	HANDLES[3].x = picture.posX;
	HANDLES[3].y = picture.posY + picture.height;

	const cornerDetectionMethod = document.getElementById("corner-detection-method").value;

	// Might greatly increases the time it takes for opening the editor and rotating the image
	if (cornerDetectionMethod && cornerDetectionMethod !== "none") {
		placeHandlesAtPageCorners(picture, cornerDetectionMethod, true);
	}

	if (CORNERS_DEBUG === true) {
		showArea(HANDLES[0].x, HANDLES[0].y, HANDLE_RADIUS*2, HANDLE_RADIUS*2, 0.3);
		showArea(HANDLES[1].x, HANDLES[1].y, HANDLE_RADIUS*2, HANDLE_RADIUS*2, 0.3);
		showArea(HANDLES[2].x, HANDLES[2].y, HANDLE_RADIUS*2, HANDLE_RADIUS*2, 0.3);
		showArea(HANDLES[3].x, HANDLES[3].y, HANDLE_RADIUS*2, HANDLE_RADIUS*2, 0.3);
	}
};

/**
 * Try to obtain page corners from the image then place the handles using their positions.
 *
 * Uses either OpenCV (which is also required by the rest of the code)
 * or TrackingJS (which is only used for this function).
 */
var placeHandlesAtPageCorners = function(picture, method, filterPoints)
{
	var points = null;

	if (method === "tracking-js") {
		points = trackingJsCornerDetection(picture); // Using TrackingJS
	} else if (method === "opencv-harris") {
		points = harrisCornerDetection(picture); // Using OpenCV
	} else if (method === "opencv-shithomas") {
		points = shiThomasCornerDetection(picture); // Using OpenCV
	}

	if (!points || points.length < 4) {
		return;
	}

	var topLeft = null;
	var topRight = null;
	var bottomRight = null;
	var bottomLeft = null;

	var topLeft2 = null;
	var topRight2 = null;
	var bottomRight2 = null;
	var bottomLeft2 = null;

	var topLeftCorner = picture.getTopLeftCorner();
	var topRightCorner = picture.getTopRightCorner();
	var bottomRightCorner = picture.getBottomRightCorner();
	var bottomLeftCorner = picture.getBottomLeftCorner();

	// Not used right now
	/*var averageCenterColor = null;
	var imageInfos = null;

	if (filterPoints === true) {
		averageCenterColor = getAverageColorAroundCenter(50, 50, IMAGE_DATA);
		imageInfos = {
			center: {
				averageColor: averageCenterColor,
				lightness:    rgbLightness(averageCenterColor)
			},
			topLeft:     getImageCornerInfos(topLeftCorner.x, topLeftCorner.y, IMAGE_DATA),
			topRight:    getImageCornerInfos(topRightCorner.x, topRightCorner.y, IMAGE_DATA),
			bottomLeft:  getImageCornerInfos(bottomRightCorner.x, bottomRightCorner.y, IMAGE_DATA),
			bottomRight: getImageCornerInfos(bottomLeftCorner.x, bottomLeftCorner.y, IMAGE_DATA)
		};

		// Everage color distance between the image center and all the corners
		imageInfos.averageColorDistance = (
			colorDistance(averageCenterColor, cornersDescription.topLeft.averageColor) +
			colorDistance(averageCenterColor, cornersDescription.topRight.averageColor) +
			colorDistance(averageCenterColor, cornersDescription.bottomLeft.averageColor) +
			colorDistance(averageCenterColor, cornersDescription.bottomRight.averageColor)
		) / 4;

		// From the imageInfos we should calculate the threshold value passed to
		// isPossiblePageCorner() by taking the average color distance in the image.
	}*/

	// The number of detected points can be huge, too much to be processed by javascript fast enough.
	// A lot of points are very close to each others, which is not very useful.
	// Here we will devide the image in squares the size of the selectable handle and keep only one point in each square.
	var positions = [];
	var vChunks = picture.width / HANDLE_RADIUS;
	var hChunks = picture.height / HANDLE_RADIUS;

	for (var y=0; y<hChunks; y++) {
		for (var x=0; x<vChunks; x++) {
			var posX = picture.posX + (HANDLE_RADIUS * x);
			var posY = picture.posY + (HANDLE_RADIUS * y);

			var zoneCenterPosX = posX + Math.round(HANDLE_RADIUS / 2);
			var zoneCenterPosY = posY + Math.round(HANDLE_RADIUS / 2);

			var found = false;

			pts: for (var i = 0; i < points.length; i += 2) {
				var pos = {
					x: points[i] + picture.posX,
					y: points[i + 1] + picture.posY
				};

				if (overlaps(pos.x,pos.y, zoneCenterPosX,zoneCenterPosY, HANDLE_RADIUS)) {
					// Not the first point in this zone, ignore it
					if (found === true) {
						break pts;
					}

					found = true;
					positions.push(pos);
				}
			}
		}
	}

	console.log("Found " + positions.length + " positions among " + points.length + " points");

	var pointsToBeDrawn = [];

	for (var i=0; i<positions.length; i++) {
	/*for (var i = 0; i < points.length; i += 2) {
		var pos = {
			x: points[i] + picture.posX,
			y: points[i + 1] + picture.posY
		};*/

		var pos = positions[i];

		// Ignore points not likely to be a page corner
		// This can cause this function to be very slow as it will need to execute operations on each points
		if (filterPoints === true && !isPossiblePageCorner(pos)) {
			if (CORNERS_DEBUG === true) {
				pointsToBeDrawn.push({
					color: "#0f0",
					pos:    pos,
					size:   7
				});
			}

			continue;
		}

		// Display point
		if (CORNERS_DEBUG === true) {
			pointsToBeDrawn.push({
				color: "#f00",
				pos:    pos,
				size:   7
			});
		}

		var topLeftDistance = distance(pos, topLeftCorner);
		var topRightDistance = distance(pos, topRightCorner);
		var bottomRightDistance = distance(pos, bottomRightCorner);
		var bottomLeftDistance = distance(pos, bottomLeftCorner);

		var topPixel = {x: pos.x, y: 0};
		var leftPixel = {x: 0, y: pos.y};
		var rightPixel = {x: picture.width, y: pos.y};
		var bottomPixel = {x: pos.x, y: picture.height};

		var topDistance = distance(pos, topPixel);
		var leftDistance = distance(pos, leftPixel);
		var rightDistance = distance(pos, rightPixel);
		var bottomDistance = distance(pos, bottomPixel);

		// Create an object holding various information about the current point
		var pointInfos = {
			pos: pos,
			dist: {
				tl: topLeftDistance,
				tr: topRightDistance,
				br: bottomRightDistance,
				bl: bottomLeftDistance,
				t: topDistance,
				l: leftDistance,
				r: rightDistance,
				b: bottomDistance
			},
			overlaps: function(other) {
				if (!other) return false;

				return overlaps(this.pos.x,this.pos.y, other.pos.x,other.pos.y, HANDLE_RADIUS);
			}
		};

		// Detect corners by checking distances from the 4 image corners
		if (topLeft === null || topLeftDistance < topLeft.dist.tl) {
			topLeft = pointInfos;
		}
		if (topRight === null || topRightDistance < topRight.dist.tr) {
			topRight = pointInfos;
		}
		if (bottomRight === null || bottomRightDistance < bottomRight.dist.br) {
			bottomRight = pointInfos;
		}
		if (bottomLeft === null || bottomLeftDistance < bottomLeft.dist.bl) {
			bottomLeft = pointInfos;
		}

		// Use another method to try to find other possible results
		if (topLeft2 === null || (pos.x < topLeft2.pos.x && pos.y < topLeft2.pos.y)) {
			topLeft2 = pointInfos;
		}
		if (topRight2 === null || (pos.x > topRight2.pos.x && pos.y < topRight2.pos.y)) {
			topRight2 = pointInfos;
		}
		if (bottomRight2 === null || (pos.x > bottomRight2.pos.x && pos.y > bottomRight2.pos.y)) {
			bottomRight2 = pointInfos;
		}
		if (bottomLeft2 === null || (pos.x < bottomLeft2.pos.x && pos.y > bottomLeft2.pos.y)) {
			bottomLeft2 = pointInfos;
		}
	}

	// The topright corner found by the method1 is very close the the one found by method2
	// but is closer to the top than the method 2 one, so it's more likely that it's the real top right corner.
	// Use the same logic for all the other corners
	if (topLeft2 !== null && topLeft2.pos.y < topLeft.pos.y && Math.abs(topLeft2.dist.tl - topLeft.dist.tl) < 15) {
		topLeft = topLeft2;
	}
	if (topRight2 !== null && topRight2.pos.y < topRight2.pos.y && Math.abs(topRight2.dist.tr - topRight.dist.tr) < 15) {
		topRight = topRight2;
	}
	if (bottomRight2 !== null && bottomRight2.pos.x > bottomRight.pos.x && Math.abs(bottomRight2.dist.br - bottomRight.dist.br) < 15) {
		bottomRight = bottomRight2;
	}
	if (bottomLeft2 !== null && bottomLeft2.pos.x < bottomLeft.pos.x && Math.abs(bottomLeft2.dist.bl - bottomLeft.dist.bl) < 15) {
		bottomLeft = bottomLeft2;
	}

	// Display results
	if (CORNERS_DEBUG === true) {
		if (topLeft) drawLineBetweenPoints(topLeft.pos, topLeftCorner, "#0F0");
		if (topRight) drawLineBetweenPoints(topRight.pos, topRightCorner, "#0F0");
		if (bottomRight) drawLineBetweenPoints(bottomRight.pos, bottomRightCorner, "#0F0");
		if (bottomLeft) drawLineBetweenPoints(bottomLeft.pos, bottomLeftCorner, "#0F0");
		if (topLeft2) drawLineBetweenPoints(topLeft2.pos, topLeftCorner, "#F0F");
		if (topRight2) drawLineBetweenPoints(topRight2.pos, topRightCorner, "#F0F");
		if (bottomRight2) drawLineBetweenPoints(bottomRight2.pos, bottomRightCorner, "#F0F");
		if (bottomLeft2) drawLineBetweenPoints(bottomLeft2.pos, bottomLeftCorner, "#F0F");

		for (var i=0; i<pointsToBeDrawn.length; i++) {
			CONTEXT.fillStyle = pointsToBeDrawn[i].color;
			CONTEXT.fillRect(pointsToBeDrawn[i].pos.x, pointsToBeDrawn[i].pos.y, pointsToBeDrawn[i].size, pointsToBeDrawn[i].size);
		}
	}

	// Prevent overlapping points
	// Note: clone objects using JSON.parse() to fix a bug where a simple assignation would not work
	if (!topLeft || (topLeft.overlaps(topRight) || topLeft.overlaps(bottomRight) || topLeft.overlaps(bottomLeft))) {
		var newTopLeft = JSON.parse(JSON.stringify(topLeft ? topLeft : {}));
		newTopLeft.pos = topLeftCorner;
		topLeft = newTopLeft;
	}
	if (!topRight || (topRight.overlaps(topLeft) || topRight.overlaps(bottomRight) || topRight.overlaps(bottomLeft))) {
		var newTopRight = JSON.parse(JSON.stringify(topRight ? topRight : {}));
		newTopRight.pos = topRightCorner;
		topRight = newTopRight;
	}
	if (!bottomRight || (bottomRight.overlaps(topRight) || bottomRight.overlaps(topLeft) || bottomRight.overlaps(bottomLeft))) {
		var newBottomRight = JSON.parse(JSON.stringify(bottomRight ? bottomRight : {}));
		newBottomRight.pos = bottomRightCorner;
		bottomRight = newBottomRight;
	}
	if (!bottomLeft || (bottomLeft.overlaps(topRight) || bottomLeft.overlaps(bottomRight) || bottomLeft.overlaps(topLeft))) {
		var newBottomLeft = JSON.parse(JSON.stringify(bottomLeft ? bottomLeft : {}));
		newBottomLeft.pos = bottomLeftCorner;
		bottomLeft = newBottomLeft;
	}

	topLeft = topLeft.pos;
	topRight = topRight.pos;
	bottomRight = bottomRight.pos;
	bottomLeft = bottomLeft.pos;

	// Set handle positions
	if (topLeft.x >= 0 && topLeft.y >= 0) {
		HANDLES[0] = topLeft;
	}
	if (topRight.x >= 0 && topRight.y >= 0) {
		HANDLES[1] = topRight;
	}
	if (bottomRight.x >= 0 && bottomRight.y >= 0) {
		HANDLES[2] = bottomRight;
	}
	if (bottomLeft.x >= 0 && bottomLeft.y >= 0) {
		HANDLES[3] = bottomLeft;
	}
};

var getImageCornerInfos = function(x, y, imageData)
{
	var averageColor = getAverageColorAroundPoint(x, y, 10, 10, imageData);

	return {
		averageColor: averageColor,
		lightness:    rgbLightness(averageColor)
	};
};

/**
 *
 * @param {object} pos:       Position object
 * @param {object} threshold: Custom threshold value, default is 75
 */
var isPossiblePageCorner = function(pos, threshold)
{
	// Default value
	if (!threshold) threshold = 75;

	var areaSize = HANDLE_RADIUS * 2;
	var areaHalf = Math.round(areaSize / 2);
	var imageData = CONTEXT.getImageData(pos.x-areaHalf, pos.y-areaHalf, areaSize, areaSize);

	var topLeftRgb = getRgbFromImageDataAt(imageData, 0, 0);
	var topRightRgb = getRgbFromImageDataAt(imageData, imageData.width-1, 0);
	var bottomLeftRgb = getRgbFromImageDataAt(imageData, 0, imageData.height-1);
	var bottomRightRgb = getRgbFromImageDataAt(imageData, imageData.width-1, imageData.height-1);

	// Calculate the color distance between those 4 points;
	var sum = 0
		+ colorDistance(topLeftRgb, topRightRgb)
		+ colorDistance(topLeftRgb, bottomLeftRgb)
		+ colorDistance(topLeftRgb, bottomRightRgb)

		+ colorDistance(topRightRgb, topLeftRgb)
		+ colorDistance(topRightRgb, bottomLeftRgb)
		+ colorDistance(topRightRgb, bottomRightRgb)

		+ colorDistance(bottomLeftRgb, topLeftRgb)
		+ colorDistance(bottomLeftRgb, topRightRgb)
		+ colorDistance(bottomLeftRgb, bottomRightRgb)

		+ colorDistance(bottomRightRgb, topLeftRgb)
		+ colorDistance(bottomRightRgb, topRightRgb)
		+ colorDistance(bottomRightRgb, bottomLeftRgb);
	var avg = Math.round(sum / 12);

	/*printRgb(topLeftRgb, "topLeft");
	printRgb(topRightRgb, "topRight");
	printRgb(bottomLeftRgb, "bottomLeft");
	printRgb(bottomRightRgb, "bottomRight");
	console.log("SUM: " + sum + ", AVG: " + avg);
	console.log("-----------------------------");*/

	// A big color distance between the 4 corners of the area around a point is the sign of a potential corner.
	return avg > threshold;
};

var drawLineBetweenPoints = function(a, b, color)
{
	if (color === undefined) {
		color = "#0F0";
	}

	CONTEXT.beginPath();
	CONTEXT.moveTo(a.x, a.y);
	CONTEXT.lineTo(b.x, b.y);
	CONTEXT.strokeStyle = color;
	CONTEXT.stroke();
};

/**
 * https://github.com/m320ng/fast9
 */
var makeGrayscaleImageDataArray = function(picture)
{
	// Make grayscale buffer
	var gs = new Array(picture.width * picture.height);
	var index = 0;
	var data = picture.getOriginalImageData(CONTEXT).data;

	for (var y=0; y<picture.height; y++) {
		for (var x=0; x<picture.width; x++) {
			var idx = (picture.width * y + x) << 2;
			var gray = parseInt(data[idx] * 0.3 + data[idx+1] * 0.6 + data[idx+2] * 0.11);

			//var gray = (data[idx] >> 2) + (data[idx+1] >> 1) + (data[idx+2] >> 2); // faster
			if (gray > 0xFF) gray = 0xFF;

			gs[index++] = gray;
		}
	}

	// gs is an array like imageData.data
	return gs;
};

/**
 * Detect corners using TrackingJS.
 * https://trackingjs.com/examples/fast.html
 *
 * Works but there's too much unwanted points most of the time making it difficult to determine the true corners.
 */
var trackingJsCornerDetection = function(picture)
{
	tracking.Fast.THRESHOLD = 30;

	var imageData = IMAGE_DATA;
	//imageData = updateSharpness(imageData, -1); // Can reduce the number of found corners
	//imageData = filterThreshold(imageData, 90);

	var data = tracking.Image.grayscale(imageData.data, picture.width, picture.height);

	return tracking.Fast.findCorners(data, picture.width, picture.height);
};

/**
 * Detect corners using OpenCV.
 * https://github.com/ucisysarch/opencvjs/blob/master/test/features_2d.html
 *
 * Can works better than TrackingJS in some case but EXTREMELY slow with big images,
 * to the point that it can completly freeze the browser and produce out of memory exceptions.
 */
var harrisCornerDetection = function(picture, threshold)
{
	// Default threshold
	if (!threshold) threshold = 120;

	var points = [];
	var minValue = undefined;
	var maxValue = undefined;
	var img = cv.imread(picture.image);
	var img_gray = new cv.Mat();
	var img_color = new cv.Mat();

	cv.cvtColor(img, img_gray, cv.COLOR_RGBA2GRAY, 0);
	cv.cvtColor(img, img_color, cv.COLOR_RGBA2RGB, 0);
	img.delete();

	var dst = cv.Mat.zeros(img_color.cols, img_color.rows, cv.CV_32FC1);
	var blockSize = 2;
	var apertureSize = 3;
	var k = 0.04;

	cv.cornerHarris(img_gray, dst, blockSize, apertureSize, k, cv.BORDER_DEFAULT);

	var dst_norm = new cv.Mat();
	var dst_norm_scaled = new cv.Mat();

	cv.normalize(dst, dst_norm, 0, 255, 32, cv.CV_32FC1, new cv.Mat());
	cv.convertScaleAbs(dst_norm, dst_norm_scaled, 1, 0);

	for (var j = 0; j < dst_norm.rows ; j++) {
		for (var i = 0; i < dst_norm.cols; i++) {
			var value = dst_norm.floatAt(j, i);

			if (value > threshold) {
				points.push([i, j]);
			}

			if (minValue === undefined || value < minValue) {
				minValue = value;
			}
			if (maxValue === undefined || value > maxValue) {
				maxValue = value;
			}
		}
	}

	cv.imshow(CANVAS, dst_norm_scaled);
	dst.delete();
	dst_norm.delete();
	dst_norm_scaled.delete();
	img_gray.delete();
	img_color.delete();

	// Draw points
	/*for (var i=0; i<points.length; i++) {
		CONTEXT.fillStyle = "#f00";
		CONTEXT.fillRect(points[i][0], points[i][1], 5, 5);
	}
	console.log(points.length, "points found", minValue, "is minimum", maxValue, "is maximum");*/

	return points;
};

/**
 * Detect corners using OpenCV.
 * https://github.com/ucisysarch/opencvjs/blob/master/test/features_2d.html
 *
 * Gives similar results as using trackingJsCornerDetection() meaning if also has has the same drawbacks.
 * It's slower than trackingJsCornerDetection() but faster than harrisCornerDetection().
 */
var shiThomasCornerDetection = function(picture, maxCorners)
{
	// Default value
	if (!maxCorners) maxCorners = 4;

	var points = [];
	var img = cv.imread(picture.image);
	var img_gray = new cv.Mat();
	var img_color = new cv.Mat(); // Opencv likes RGB

	cv.cvtColor(img, img_gray, cv.COLOR_RGBA2GRAY, 0);
	cv.cvtColor(img, img_color, cv.COLOR_RGBA2RGB, 0);
	img.delete();

	var corners = new cv.Mat();
	var qualityLevel = 0.01;
	var minDistance = 10;
	var blockSize = 3;
	var useHarrisDetector = false;
	var k = 0.04;
	var copy = new cv.Mat();

	copy = img_color.clone();

	/// Apply corner detection
	cv.goodFeaturesToTrack(img_gray, corners, maxCorners, qualityLevel, minDistance, new cv.Mat(), blockSize, useHarrisDetector, k);
	img_gray.delete();
	img_color.delete();

	for (var i = 0; i < corners.rows; i++) {
		var x = corners.floatAt(i, 0);
		var y = corners.floatAt(i, 1);

		points.push([x, y]);
	}

	/// Show what you got
	cv.imshow(CANVAS, copy);
	copy.delete();
	corners.delete();

	// Draw points
	/*for (var i=0; i<points.length; i++) {
		CONTEXT.fillStyle = "#f00";
		CONTEXT.fillRect(points[i][0], points[i][1], 5, 5);
	}
	console.log(points.length, "points found");*/

	return points;
};

var clearFrame = function()
{
	CONTEXT.clearRect(0, 0, CANVAS.width, CANVAS.height);
};

/**
 * Draw a frame on the canvas.
 */
var drawFrame = function()
{
	if (CORNERS_DEBUG === true) {
		return;
	}

	// Draw the background
	CONTEXT.fillStyle = "#303030";
	CONTEXT.fillRect(0, 0, CANVAS.width, CANVAS.height);

	var posX = ORIGINAL_PICTURE.posX;
	var posY = ORIGINAL_PICTURE.posY;

	if (CROPPED_PICTURE) {
		posX = CROPPED_PICTURE.posX;
		posY = CROPPED_PICTURE.posY;
	}

	// Draw the image
	CONTEXT.putImageData(IMAGE_DATA, posX, posY);

	// Draw the selection polygon
	if (!CROPPED_PICTURE) {
		drawSelectionPolygon();
	}
};

var drawSelectionPolygon = function()
{
	CONTEXT.fillStyle = "rgba(255, 255, 255, 0.3)";
	CONTEXT.beginPath();

	// Draw lines
	for (var i=0; i<HANDLES.length; i++) {
		if (i === 0) {
			CONTEXT.moveTo(HANDLES[i].x, HANDLES[i].y);
		} else {
			CONTEXT.lineTo(HANDLES[i].x, HANDLES[i].y);
		}
	}

	CONTEXT.closePath();
	CONTEXT.fill();
	CONTEXT.strokeStyle = HANDLE_COLOR;
	CONTEXT.stroke();

	// Draw handles
	for (var i=0; i<HANDLES.length; i++) {
		CONTEXT.beginPath();
		CONTEXT.arc(HANDLES[i].x, HANDLES[i].y, HANDLE_RADIUS, 0, 2 * Math.PI, false);
		CONTEXT.fillStyle = HANDLE_COLOR;

		// Assign a color to each handle for testing
		/*if (i===0) CONTEXT.fillStyle = "#f00";
		else if (i===1) CONTEXT.fillStyle = "#0f0";
		else if (i===2) CONTEXT.fillStyle = "#00f";
		else if (i===3) CONTEXT.fillStyle = "#f0f";*/

		CONTEXT.fill();
	}
};

// Set mouse positions.
// https://stackoverflow.com/questions/17130395/real-mouse-position-in-canvas
var getMouse = function(e)
{
	var rect = CANVAS.getBoundingClientRect();

	MOUSE_X = (e.clientX - rect.left) * (CANVAS.width / rect.width);
	MOUSE_Y = (e.clientY - rect.top) * (CANVAS.height / rect.height);
};

/**
 * Checks if a given position is inside an object.
 *
 * @param {*} x1
 * @param {*} y1
 * @param {*} x2
 * @param {*} y2
 */
var overlaps = function(x1,y1, x2,y2, radius)
{
	return x1 >= (x2 - radius)
		&& x1 <= (x2 + radius)
		&& y1 >= (y2 - radius)
		&& y1 <= (y2 + radius);
};

/*
Mouse events
*/

/**
 * Happens when the mouse is clicked in the canvas.
 */
CANVAS.onmousedown = function(e)
{
	getMouse(e);

	// Check if an handle is clicked
	for (var i=0; i<HANDLES.length; i++) {
		if (overlaps(MOUSE_X,MOUSE_Y, HANDLES[i].x,HANDLES[i].y,HANDLE_RADIUS)) {
			SELECTED_HANDLE_INDEX = i;
		}
	}
};

/**
 * Unselect handle when we stop holding the mouse buttons.
 */
CANVAS.onmouseup = function()
{
	SELECTED_HANDLE_INDEX = -1;
};

/**
 * Happens when the mouse is moving inside the canvas.
 */
CANVAS.onmousemove = function(e)
{
	// No handle selected
	if (SELECTED_HANDLE_INDEX < 0) {
		return;
	}

	getMouse(e);

	HANDLES[SELECTED_HANDLE_INDEX].x = MOUSE_X;
	HANDLES[SELECTED_HANDLE_INDEX].y = MOUSE_Y;

	clearFrame();
	drawFrame();
};

/*
Touch events
http://bencentra.com/code/2014/12/05/html5-canvas-touch-events.html
*/

// Set up touch events for mobile, etc
CANVAS.addEventListener("touchstart", function (e) {
	if (e.target === CANVAS) {
		e.preventDefault();
	}

	CANVAS.dispatchEvent(new MouseEvent("mousedown", {
		clientX: e.touches[0].clientX,
		clientY: e.touches[0].clientY
	}));
}, false);

CANVAS.addEventListener("touchend", function (e) {
	if (e.target === CANVAS) {
		e.preventDefault();
	}

	CANVAS.dispatchEvent(new MouseEvent("mouseup", {}));
}, false);

CANVAS.addEventListener("touchmove", function (e) {
	if (e.target === CANVAS) {
		e.preventDefault();
	}

	CANVAS.dispatchEvent(new MouseEvent("mousemove", {
		clientX: e.touches[0].clientX,
		clientY: e.touches[0].clientY
	}));
}, false);

window.resetCrop = function()
{
	// Still working on another task
	if (WORKING) {
		return;
	}

	IMAGE_DATA = ORIGINAL_PICTURE.originalImageData;
	CROPPED_PICTURE = null;

	// Frame is drawn two times first to draw the image and then to draw the selection polygon
	setStep(1);
	resetSliders();
	clearFrame();
	drawFrame();
	placeHandles(ORIGINAL_PICTURE);
	drawFrame();
};

window.resetFilters = function()
{
	// Still working on another task
	if (WORKING) {
		return;
	}

	IMAGE_DATA = getOriginalyDisplayedImageData();

	resetSliders();
	clearFrame();
	drawFrame();
};

/**
 * Automatically apply filters in order to improve the image.
 */
window.autoImproveImage = function()
{
	// Still working on another task
	if (WORKING) {
		return;
	}

	var brightness = calculateBrightness();
	var contrast = calculateContrast();
	var saturation = calculateSaturation();
	//var sharpness = calculateSharpness();

	BRIGHTNESS = brightness > 100 ? brightness - 100 : BRIGHTNESS;
	CONTRAST += contrast;
	SATURATION += saturation;
	//SHARPNESS = sharpness;

	// Update slider positions
	brightnessSlider(BRIGHTNESS);
	contrastSlider(CONTRAST);
	saturationSlider(SATURATION);
	sharpnessSlider(SHARPNESS);

	applyFilters();
	drawFrame();
};

window.crop = function()
{
	doLongWork(function(callback){
		// Image not rotated, just crop it
		if (!ROTATE_ON_CROP) {
			return cropImage(CANVAS, CONTEXT, callback);
		}

		// Rotate the image then crop it
		ORIGINAL_PICTURE.rotate(ROTATION, function(rotated) {
			// Rotate the image
			if (rotated === true) {
				clearFrame();
				ORIGINAL_PICTURE.fit(CANVAS);
				ORIGINAL_PICTURE.draw(CONTEXT);
				IMAGE_DATA = ORIGINAL_PICTURE.getOriginalImageData(CONTEXT);
			}

			// Crop the image
			return cropImage(CANVAS, CONTEXT, callback);
		});
	});
};

var cropImage = function(canvas, context, callback)
{
	// Image not available yet
	if (!ORIGINAL_PICTURE || !ORIGINAL_PICTURE.image) {
		return;
	}

	canvas.width = ORIGINAL_PICTURE.image.width;
	canvas.height = ORIGINAL_PICTURE.image.height;

	// Crop the image
	cropSelection(canvas, context, ORIGINAL_PICTURE.scaleFactor);

	// Display the cropped image
	var image = new Image();
	image.src = canvas.toDataURL("image/png");

	image.onload = function() {
		setStep(2);
		clearFrame();

		CROPPED_PICTURE = new Picture(image);
		CROPPED_PICTURE.fit(CANVAS);
		CROPPED_PICTURE.draw(CONTEXT);

		IMAGE_DATA = CROPPED_PICTURE.getOriginalImageData(CONTEXT);

		applyFiltersToImageData();
		drawFrame();

		// Reset rotation as it was applied to the image at this point
		ROTATION = 0;

		if (callback !== undefined) {
			callback();
		}
	};
};

/**
 *
 * @param {function} doWork
 */
var doLongWork = function(doWork)
{
	LOADING.classList.remove("shown");

	// Still working on another task
	if (WORKING) {
		return;
	}

	WORKING = true;

	LOADING.classList.add("shown");

	doWork(function() {
		LOADING.classList.remove("shown");
	});

	WORKING = false;
};

/**
 * Retrieve the final edited image as data url.
 */
window.saveImageAsDataUrl = function()
{
	doLongWork(function(){
		// Clear first canvas
		clearFrame();

		// create an in-memory canvas
		var bufferCanvas = document.createElement("canvas");
		var bufferContext = bufferCanvas.getContext("2d");

		// Size the canvas according to the original image
		bufferCanvas.width = ORIGINAL_PICTURE.image.width;
		bufferCanvas.height = ORIGINAL_PICTURE.image.height;

		// Apply image cropping
		if (CROPPED_PICTURE) {
			IMAGE_DATA = cropSelection(bufferCanvas, bufferContext, ORIGINAL_PICTURE.scaleFactor);
		} else {
			// Context not deformed, just draw the image
			bufferContext.clearRect(0, 0, bufferCanvas.width, bufferCanvas.height);
			bufferContext.drawImage(ORIGINAL_PICTURE.image, 0, 0, bufferCanvas.width, bufferCanvas.height);
			bufferContext.restore();

			IMAGE_DATA = bufferContext.getImageData(0, 0, bufferCanvas.width, bufferCanvas.height);
		}

		// Apply filters to the image
		applyFiltersToImageData();
		bufferContext.putImageData(IMAGE_DATA, 0, 0);

		// Remove the first canvas and set the final image as background to show the result
		var dataUrl = bufferCanvas.toDataURL("image/jpeg");

		// No need to rotate the image, emit the final edited image
		if (ROTATION === 0 || ROTATION === 360) {
			return closeAndEmitEditedImage(dataUrl);
		}

		// We need to rotate the image
		// Works but currently leaves some black bars to the left and right sides.
		var image = new Image();
		image.src = dataUrl;

		image.onload = function() {
			bufferContext.clearRect(0, 0, bufferCanvas.width, bufferCanvas.height);

			bufferCanvas.width = image.width;
			bufferCanvas.height = image.height;

			if (ROTATION === 90 || ROTATION === 270) {
				bufferCanvas.width = image.height;
				bufferCanvas.height = image.width;
			}

			bufferContext.save();
			bufferContext.translate(bufferCanvas.width/2, bufferCanvas.height/2);
			bufferContext.rotate(ROTATION * Math.PI/180);
			bufferContext.drawImage(image, -IMAGE_DATA.width/2, -IMAGE_DATA.height/2, IMAGE_DATA.width, IMAGE_DATA.height);
			bufferContext.restore();

			dataUrl = bufferCanvas.toDataURL("image/jpeg");

			// No need to rotate the image, emit the final edited image
			return closeAndEmitEditedImage(dataUrl);
		};
	});
};

window.rotateLeft = function()
{
	ROTATION -= 90;

	if (ROTATION < 0) {
		ROTATION = 270;
	}

	rotateImage(ROTATION);
};

window.rotateRight = function()
{
	ROTATION += 90;

	if (ROTATION > 360) {
		ROTATION = 90;
	}

	rotateImage(ROTATION);
};

var closeAndEmitEditedImage = function(dataUrl)
{
	// Open the image in a new tab
	var image = new Image();
	var newWindow = window.open("");
	image.src = dataUrl;
	newWindow.document.write(image.outerHTML);

	// ... or convert the image to a File object
	// var file = dataUrlToFile(dataUrl);

	// ...or load the image in an <img> element using jQuery
	// $("img#frame").attr("src", dataUrl);

	// Remove loading screen
	LOADING.classList.remove("shown");
};

var rotateImage = function(degrees)
{
	if (CROPPED_PICTURE) {
		rotatePicture(CROPPED_PICTURE, degrees, false);
	} else {
		rotatePicture(ORIGINAL_PICTURE, degrees, true);
	}
};

var rotatePicture = function(picture, degrees, willPlaceHandles)
{
	// Image not available yet
	if (!picture || !picture.image) {
		return;
	}

	// Much faster method
	ROTATE_ON_CROP = true;
	ROTATION = degrees;

	clearFrame();

	var width = picture.image.width;
	var height = picture.image.height;

	if (degrees === 90 || degrees === 270) {
		width = picture.image.height;
		height = picture.image.width;
	}

	// Create a Picture object to calculate the size and position of the rotated image
	var tempPic = new Picture(new Image(width, height));
	tempPic.fit(CANVAS);

	var drawWidth = picture.image.width * tempPic.scaleFactor;
	var drawHeight = picture.image.height * tempPic.scaleFactor;

	CONTEXT.save();
	CONTEXT.translate(CANVAS.width/2, CANVAS.height/2);
	CONTEXT.rotate(degrees * Math.PI/180);
	CONTEXT.drawImage(picture.image, -drawWidth/2, -drawHeight/2, drawWidth, drawHeight);
	CONTEXT.restore();

	IMAGE_DATA = tempPic.getOriginalImageData(CONTEXT);

	picture.posX = tempPic.posX;
	picture.posY = tempPic.posY;
	picture.originalImageData = IMAGE_DATA;

	if (willPlaceHandles === true) {
		placeHandles(tempPic);
	}

	applyFiltersToImageData();
	drawFrame();
};

/**
 * Try to mesure how bright the image is.
 */
var calculateBrightness = function()
{
	var data = getOriginalyDisplayedImageData().data;
	var total = 0;

	for (var i=0; i<data.length; i+=4) {
		var r = data[i];
		var g = data[i+1];
		var b = data[i+2];

		total += Math.floor((r + g + b) / 3);
	}

	return Math.floor(total / (IMAGE_DATA.width * IMAGE_DATA.height));
};

/**
* Try to mesure how contrasted the image is.
* https://stackoverflow.com/questions/9733288/how-to-programmatically-calculate-the-contrast-ratio-between-two-colors
*/
var calculateContrast = function()
{
	var avg = getAverageColor();
	var a = [avg.r, avg.g, avg.b].map(function (v) {
		v /= 255;

		return v <= 0.03928
			? v / 12.92
			: Math.pow((v + 0.055) / 1.055, 2.4);
	});

	return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
};

/**
* Try to mesure how saturated the image is.
*/
var calculateSaturation = function()
{
	var avg = getAverageColor();

	return (avg.b - avg.r) / avg.b;
};

// Try to mesure how sharp the image is.
// https://pastebin.com/8hc1sURE
var calculateSharpness = function()
{
	var data = getOriginalyDisplayedImageData().data;

	// It would take too long to examine the sharpness of every pixel.
	// This variable specifies the size of the gaps between rows and
	// columns of the pixels we actually check
	var gridSize = 10; // grid size
	var maxdiff = 0;

	var xmax = 0;
	var ymax = 0;

	// Check every $gridSize-th row of the image and store the max difference
	// between adjacent pixels
	// Note: the formula 0.35*$r + 0.50*$g + 0.15*$b converts RGB values into
	// perceptual brightness
	for (var x=gridSize/2; x<=ORIGINAL_PICTURE.width-gridSize/2; x+=gridSize) {
		var index = getIndexOfPixelAt(x, gridSize/2);

		var r = data[index];
		var g = data[index+1];
		var b = data[index+2];
		var v0 = Math.floor(0.35*r + 0.50*g + 0.15*b);

		for (var y=gridSize/2+1; y<=ORIGINAL_PICTURE.height-gridSize/2; y++) {
			var index = getIndexOfPixelAt(x, y);

			r = data[index];
			g = data[index+1];
			b = data[index+2];
			var v = Math.floor(0.35*r + 0.50*g + 0.15*b);

			if (maxdiff < Math.abs(v - v0)) {
				maxdiff = Math.abs(v - v0);
				xmax = x;
				ymax = y;
			}

			v0 = v;
		}
	}

	for (var y=gridSize/2; y<=ORIGINAL_PICTURE.height-gridSize/2; y+=gridSize) {
		var index = getIndexOfPixelAt(x, gridSize/2);

		var r = data[index];
		var g = data[index+1];
		var b = data[index+2];
		var v0 = Math.floor(0.35*r + 0.50*g + 0.15*b);

		for (x=gridSize/2+1; x<=ORIGINAL_PICTURE.width-gridSize/2; x++) {
			var index = getIndexOfPixelAt(x, y);

			r = data[index];
			g = data[index+1];
			b = data[index+2];
			var v = Math.floor(0.35*r + 0.50*g + 0.15*b);

			if (maxdiff < Math.abs(v - v0)) {
				maxdiff = Math.abs(v - v0);
				xmax = x;
				ymax = y;
			}

			v0 = v;
		}
	}

	// Now calculate the range of brightness in the 9x9 block of pixels
	// centered on the location of maximum contrast found above
	var maxv = 0;
	var minv = 255;

	for (var x=xmax-4; x<=xmax+4; x++) {
		for (var y=ymax-4; y<=ymax+4; y++) {
			var index = getIndexOfPixelAt(x, y);

			var r = data[index];
			var g = data[index+1];
			var b = data[index+2];
			var v = Math.floor(0.35*r + 0.50*g + 0.15*b);

			if (v > maxv) {
				maxv = v;
			}

			if (v < minv) {
				minv = v;
			}
		}
	}

	// Calculate a sharpness value based on this brightness range
	return (maxdiff / (15 + maxv - minv)) * 27000 / 255; // In %
};

var calculateTwoPointsAngle = function(x1,y1, x2,y2)
{
	// Use toDegrees() as otherwise the expression result would be in radians
	var angle = radToDeg(Math.atan2(x2 - x1, y2 - y1));

	// Keep angle between 0 and 360
	angle = angle + Math.ceil(-angle / 360) * 360;

	return angle;
};

/*
 * Calculate the angle formed by three points.
 * https://stackoverflow.com/questions/17763392/how-to-calculate-in-javascript-angle-between-3-points
 *
 * A first point
 * B center point
 * C second point
*/
var calculateThreePointsAngle = function(a, b, c)
{
	var ab = Math.sqrt(Math.pow(b.x - a.x, 2)+ Math.pow(b.y - a.y, 2));
	var bc = Math.sqrt(Math.pow(b.x - c.x, 2)+ Math.pow(b.y - c.y, 2));
	var ac = Math.sqrt(Math.pow(c.x - a.x, 2)+ Math.pow(c.y - a.y, 2));

	var radians = Math.acos((bc*bc + ab*ab - ac*ac) / (2 * bc*ab));

	return radToDeg(radians);
};

// https://www.w3resource.com/javascript-exercises/javascript-math-exercise-34.php
var radToDeg = function(radians)
{
	return radians * (180 / Math.PI);
};

// https://scikit-image.org/docs/dev/auto_examples/applications/plot_geometric.html
// https://opencv-python-tutroals.readthedocs.io/en/latest/py_tutorials/py_imgproc/py_geometric_transformations/py_geometric_transformations.html
// https://docs.opencv.org/3.4/dd/d52/tutorial_js_geometric_transformations.html
var cropSelection = function(canvas, context, scale)
{
	if (context === undefined) {
		context = canvas.getContext("2d");
	}

	var topLeftHandleX = HANDLES[0].x - ORIGINAL_PICTURE.posX;
	var topLeftHandleY = HANDLES[0].y - ORIGINAL_PICTURE.posY;
	var topRightHandleX = HANDLES[1].x - ORIGINAL_PICTURE.posX;
	var topRightHandleY = HANDLES[1].y - ORIGINAL_PICTURE.posY;
	var bottomRightHandleX = HANDLES[2].x - ORIGINAL_PICTURE.posX;
	var bottomRightHandleY = HANDLES[2].y - ORIGINAL_PICTURE.posY;
	var bottomLeftHandleX = HANDLES[3].x - ORIGINAL_PICTURE.posX;
	var bottomLeftHandleY = HANDLES[3].y - ORIGINAL_PICTURE.posY;

	// Scale handle positions
	if (scale !== undefined && scale !== 1) {
		topLeftHandleX /= scale;
		topLeftHandleY /= scale;
		topRightHandleX /= scale;
		topRightHandleY /= scale;
		bottomRightHandleX /= scale;
		bottomRightHandleY /= scale;
		bottomLeftHandleX /= scale;
		bottomLeftHandleY /= scale;
	}

	var topWidth = topRightHandleX - topLeftHandleX;
	var bottomWidth = bottomRightHandleX - bottomLeftHandleX;
	var leftHeight = bottomLeftHandleY - topLeftHandleY;
	var rightHeight = bottomRightHandleY - topRightHandleY;

	var minWidth = topWidth < bottomWidth ? topWidth : bottomWidth;
	var maxWidth = topWidth > bottomWidth ? topWidth : bottomWidth;
	var minHeight = leftHeight < rightHeight ? leftHeight : rightHeight;
	var maxHeight = leftHeight > rightHeight ? leftHeight : rightHeight;

	// Crop width will be halfway between the min and max ones, same for the height
	var cropWidth = minWidth + Math.round((maxWidth - minWidth) / 2);
	var cropHeight = minHeight + Math.round((maxHeight - minHeight) / 2);

	// Source points should be the width and height of the minimal rectangle englobing the selection shape
	// Or we could compute thr angle to determine what width and height it will be once deformed
	var srcPoints = [0, 0, 0, cropHeight, cropWidth, cropHeight, cropWidth, 0];
	var dstPoints = [
		topLeftHandleX,topLeftHandleY,
		bottomLeftHandleX,bottomLeftHandleY,
		bottomRightHandleX,bottomRightHandleY,
		topRightHandleX,topRightHandleY
	];

	var src = cv.imread(ORIGINAL_PICTURE.image);
	var dst = new cv.Mat();
	var dsize = new cv.Size(cropWidth, cropHeight);
	var srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, srcPoints);
	var dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, dstPoints);
	var M = cv.getPerspectiveTransform(dstTri, srcTri);

	cv.warpPerspective(src, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

	var imageData = cvMatToImageData(dst);

	src.delete();
	dst.delete();
	M.delete();
	srcTri.delete();
	dstTri.delete();

	context.clearRect(0, 0, canvas.width, canvas.height);

	canvas.width = cropWidth;
	canvas.height = cropHeight;

	context.putImageData(imageData, 0, 0);

	return context.getImageData(0, 0, cropWidth, cropHeight);
};

// Copy of cv.imshow() from OpenCV.js
var cvMatToImageData = function(mat)
{
	var img = new cv.Mat;
	var depth = mat.type() % 8;
	var scale = depth <= cv.CV_8S ? 1 : depth <= cv.CV_32S ? 1 / 256:255;
	var shift = depth === cv.CV_8S || depth === cv.CV_16S ? 128 : 0;

	mat.convertTo(img, cv.CV_8U, scale, shift);

	switch(img.type()) {
		case cv.CV_8UC1: cv.cvtColor(img,img,cv.COLOR_GRAY2RGBA); break;
		case cv.CV_8UC3: cv.cvtColor(img,img,cv.COLOR_RGB2RGBA); break;
		case cv.CV_8UC4: break;
		default: throw new Error("Bad number of channels (Source image must have 1, 3 or 4 channels)");
	}

	var imageData = new ImageData(new Uint8ClampedArray(img.data), img.cols, img.rows);

	img.delete();

	return imageData;
};

var getOriginalyDisplayedImageData = function()
{
	if (CROPPED_PICTURE) {
		return CROPPED_PICTURE.originalImageData
	}

	return ORIGINAL_PICTURE.originalImageData;
};

/**
 * Get position of the image's center.
 *
 * @param {*} width
 * @param {*} height
 */
var getImageCenterPosition = function(width, height)
{
	if (width === undefined) {
		width = 0
	};

	if (height === undefined) {
		height = width;
	}

	return {
		x: ORIGINAL_PICTURE.posX + (ORIGINAL_PICTURE.width / 2),
		y: ORIGINAL_PICTURE.posY + (ORIGINAL_PICTURE.height / 2)
	};
};

/**
 * Get the average color contained in an image data.
 */
var getAverageColor = function()
{
	var totalRed = 0;
	var totalGreen = 0;
	var totalBlue = 0;
	var pixelCounter = 0;
	var data = getOriginalyDisplayedImageData().data;

	// Iterate over the pixels
	for (var i=0; i<data.length; i+=4) {
		var red = data[i];
		var green = data[i+1];
		var blue = data[i+2];
		var alpha = data[i+3];

		totalRed += red;
		totalGreen += green;
		totalBlue += blue;

		pixelCounter++;
	}

	return {
		r: Math.round(totalRed / pixelCounter),
		g: Math.round(totalGreen / pixelCounter),
		b: Math.round(totalBlue / pixelCounter)
	};
};

/**
 * Get the average color in an area around the center of the image.
 *
 * @param {array} imageData: Optional, will be obtained from the canvas if not provided
 */
var getAverageColorAroundCenter = function(width, height, imageData)
{
	// Select a rectangular area around the image's center
	var center = getImageCenterPosition(width, height);

	return getAverageColorAroundPoint(center.x, center.y, width, height, imageData);
};

/**
 * Get the average color in an area around a given position.
 * If width and height are equal to 1 then it will return the color of the pixel at (x,y).
 *
 * @param {number} x: Relative to the canvas, not the image
 * @param {number} y: Relative to the canvas, not the image
 * @param {object} imageData: Optional, should be faster if left undefined.
 *                            If defined, x and y will be relative to the imageData, not the canvas.
 */
var getAverageColorAroundPoint = function(x, y, width, height, imageData)
{
	// Default values
	if (!width) width = 1;
	if (!height) height = width;

	var halfX = Math.round(width / 2);
	var halfY = Math.round(height / 2);

	// This works but can be very slow in a loop
	// Select a rectangular area around the point
	//if (!imageData) {
		// No image data provided, we need to get it from the canvas
		imageData = CONTEXT.getImageData(x-halfX, y-halfY, width, height);
		imageData = imageData.data;
	/*} else {
		// Extract pixels from the imageData without the need to get them from the context since it's slow
		imageData = getAreaPixelsInData(imageData, x-halfX, y-halfY, width, height);

		// This should be faster
		//var rgbs = getRgbAroundPointInData(imageData, x-halfX, y-halfY, width, height);
		//return  getAverageColorFromRgbArray(rgbs);
	}*/

	//console.log("Area of " + width + 'x' + height + ", expecting " + (width * height) + " pixels, got " + (imageData.length / 4));

	// Uncomment this to visually represent the selected area on the image
	//showArea(x, y, width, height, 0.3);

	if (imageData.length < 1) {
		return null;
	}

	return getAverageColorFromData(imageData);
};

/**
* Get the average color contained in an ilage data array.
*
* @param {} data
*/
var getAverageColorFromData = function(data)
{
	var totalRed = 0;
	var totalGreen = 0;
	var totalBlue = 0;
	var pixelCounter = 0;

	// Iterate over the pixels
	for (var i=0; i<data.length; i+=4) {
		totalRed += data[i];
		totalGreen += data[i+1];
		totalBlue += data[i+2];
		pixelCounter++;
	}

	return {
		r: Math.round(totalRed / pixelCounter),
		g: Math.round(totalGreen / pixelCounter),
		b: Math.round(totalBlue / pixelCounter)
	};
};

/**
 * Calculate the average color from multiple rgb objects in an array
 */
var getAverageColorFromRgbArray = function(rgbs)
{
	var totalRed = 0;
	var totalGreen = 0;
	var totalBlue = 0;
	var pixelCounter = 0;

	for (var i=0; i<rgbs.length; i++) {
		if (!rgbs[i]) {
			continue;
		}

		totalRed += rgbs[i].r;
		totalGreen += rgbs[i].g;
		totalBlue += rgbs[i].b;

		pixelCounter++;
	}

	return {
		r: Math.round(totalRed / pixelCounter),
		g: Math.round(totalGreen / pixelCounter),
		b: Math.round(totalBlue / pixelCounter)
	};
};

/**
 * Get an array of pixels from an imageData object without the need to get them from the canvas's context since it's slow.
 *
 * Usually, if we want to get the pixels in an area of the canvas we would do this:
 *     pixels = CONTEXT.getImageData(x, y, width, height);
 *     pixels = imageData.data;
 *
 * But getting them from the context using getImageData() like that is slow, which is pretty noticable if used in a loop.
 * So if we already have an imageData object we can extract the area we want from it using this functions instead:
 *     pixels = getAreaPixelsInData(imageData, x, y, width, height);
 *
 * NOTE:
 * After some testings this appears to be as slow or slower than getImageData().
 * Could still be useful for something else though.
 *
 * @param {*} imageData
 * @param {*} posX
 * @param {*} posY
 * @param {*} width
 * @param {*} height
 */
var getAreaPixelsInData = function(imageData, posX, posY, width, height)
{
	var partialImageData = [];
	var bottomRightX = posX + width;
	var bottomRightY = posY + height;

	// For each line of pixels...
	lines: for (var y=0; y<imageData.height; y++) {
		// First line not reached yet
		if (y < posY) {
			continue;
		}

		// For each pixel in line...
		for (var x=0; x<imageData.width; x++) {
			// First pixel not yet reached in this line
			if (x < posX) {
				continue;
			}

			// Last pixel reached, not need to continue
			if (x >= bottomRightX && y >= bottomRightY) {
				break lines;
			}

			// Add this pixel
			// Full condition: (x >= posX && y >= posY && x < bottomRightX && y < bottomRightY)
			if (x >= posX && y >= posY && x < bottomRightX && y < bottomRightY) {
				var index = getIndexOfPixelInDataAt(imageData.width, x, y);

				partialImageData.push(imageData.data[index]);   // R
				partialImageData.push(imageData.data[index+1]); // G
				partialImageData.push(imageData.data[index+2]); // B
				partialImageData.push(imageData.data[index+3]); // A
			}
		}
	}

	return partialImageData;
};

var getRgbAroundPointInData = function(imageData, posX, posY, width, height)
{
	var rgbs = [];
	var bottomRightX = posX + width;
	var bottomRightY = posY + height;

	// For each line of pixels...
	lines: for (var y=0; y<imageData.height; y++) {
		// First line not reached yet
		if (y < posY) {
			continue;
		}

		// For each pixel in line...
		for (var x=0; x<imageData.width; x++) {
			// First pixel not yet reached in this line
			if (x < posX) {
				continue;
			}

			// Last pixel reached, not need to continue
			if (x >= bottomRightX && y >= bottomRightY) {
				break lines;
			}

			// Add this pixel
			// Full condition: (x >= posX && y >= posY && x < bottomRightX && y < bottomRightY)
			if (x >= posX && y >= posY && x < bottomRightX && y < bottomRightY) {
				rgbs.push(getRgbFromImageDataAt(imageData, x, y));
			}
		}
	}

	return rgbs;
};

/**
 * Highlight an aread around a point.
 * The point is relative to the canvas, not the image.
 * So remeber to add the image's posX and posY to the point position.
 *
 * @param {*} x
 * @param {*} y
 * @param {*} width
 * @param {*} height
 * @param {*} opacity
 */
var showArea = function(x, y, width, height, opacity)
{
	// Default values
	if (!opacity) opacity = 1;
	if (!width) width = 0;
	if (!height) height = width;

	var halfX = Math.round(width / 2);
	var halfY = Math.round(height / 2);

	// Draw the area
	CONTEXT.fillStyle = "rgba(255, 0, 0, " + opacity + ")";
	CONTEXT.fillRect(x-halfX, y-halfY, width, height);

	// Draw the center point ontop of it
	CONTEXT.fillStyle = "#00f";
	CONTEXT.fillRect(x-1, y-1, 2, 2);
};

function handleUpdate()
{
	// Still working on another task
	if (WORKING) {
		return;
	}

	var value = Number(this.value);

	if (this.name === "brightness") {
		BRIGHTNESS = value;
	} else if (this.name === "contrast") {
		CONTRAST = value;
	} else if (this.name === "saturation") {
		SATURATION = value;
	} else if (this.name === "sharpness") {
		SHARPNESS = value;
	}

	// Apply filters then redraw the frame
	applyFilters();
	drawFrame();
};

/**
 * Utility function to compute distance between two points.
 *
 * @param {*} a
 * @param {*} b
 */
var distance = function(a, b)
{
	var dx = a.x - b.x;
	var dy = a.y - b.y;

	return Math.sqrt(dx*dx + dy*dy);
};

var getIndexOfPixelAt = function(x, y)
{
	return getIndexOfPixelInDataAt(ORIGINAL_PICTURE.width, x, y);
};

var getIndexOfPixelInDataAt = function(imageWidth, x, y)
{
	return (x + (y * imageWidth)) * 4;
};

var getRgbFromImageDataAt = function(imageData, x, y)
{
	var index = getIndexOfPixelInDataAt(imageData.width, x, y);

	return {
		r: imageData.data[index],
		g: imageData.data[index + 1],
		b: imageData.data[index + 2]
	};
};

/*
Filters
*/

/**
 * @param {number} value: Can range from 0 to 255
 */
var updateBrightness = function(factor)
{
	return transform(function(r, g, b, a, factor) {
		return [r + factor, g + factor, b + factor, a];
	}, factor);
};

var updateGreyscale = function(factor)
{
	return transform(function(r, g, b, a, factor) {
		var average = (r + g + b) / 3;

		return [average, average, average, a];
	}, factor);
};

var updateContrast = function(factor)
{
	return transform(function(r, g, b, a, factor) {
		return [
			factor * (r - 128) + 128,
			factor * (g - 128) + 128,
			factor * (b - 128) + 128,
			a
		];
	}, factor);
};

// https://alienryderflex.com/saturation.html
var updateSaturation = function(factor)
{
	return transform(function(r, g, b, a, factor) {
		var p = Math.sqrt((r*r*0.299) + (g*g*0.587) + (b*b*0.114));

		return [
			p + (r-p) * factor,
			p + (g-p) * factor,
			p + (b-p) * factor,
			a
		];
	}, factor);
};

//https://www.html5rocks.com/en/tutorials/canvas/imagefilters/
var updateSharpness = function(imageData, factor)
{
	factor /= 100;

	if (factor < 0) { // Blur
		return convolute(imageData, [
			1/9+factor, 1/9+factor, 1/9+factor,
			1/9+factor, 1/9+factor, 1/9+factor,
			1/9+factor, 1/9+factor, 1/9+factor
		]);
	} else if (factor > 0) { // Sharpen
		return convolute(imageData, [
			0+factor, -1+factor, 0+factor,
			-1+factor, 5+factor, -1+factor,
			0+factor, -1+factor, 0+factor
		]);
	}

	// Value is zero, nothing to change
	return imageData;
};

var convolute = function(imageData, weights, opaque)
{
	var tempContext = document.createElement("canvas").getContext("2d");
	var side = Math.round(Math.sqrt(weights.length));
	var halfSide = Math.floor(side/2);
	var src = imageData.data;
	var sw = imageData.width;
	var sh = imageData.height;
	var w = sw;
	var h = sh;
	var output = tempContext.createImageData(w, h);
	var dst = output.data;
	var alphaFac = opaque ? 1 : 0;

	// go through the destination image pixels
	for (var y=0; y<h; y++) {
		for (var x=0; x<w; x++) {
			var sy = y;
			var sx = x;
			var dstOff = (y*w+x)*4;
			var r = 0
			var g = 0
			var b = 0
			var a = 0;

			// Calculate the weighed sum of the source image pixels that fall under the convolution matrix
			for (var cy=0; cy<side; cy++) {
				for (var cx=0; cx<side; cx++) {
					var scy = sy + cy - halfSide;
					var scx = sx + cx - halfSide;

					if (scy >= 0 && scy < sh && scx >= 0 && scx < sw) {
						var srcOff = (scy*sw+scx)*4;
						var wt = weights[cy*side+cx];

						r += src[srcOff] * wt;
						g += src[srcOff+1] * wt;
						b += src[srcOff+2] * wt;
						a += src[srcOff+3] * wt;
					}
				}
			}

			dst[dstOff] = r;
			dst[dstOff+1] = g;
			dst[dstOff+2] = b;
			dst[dstOff+3] = a + alphaFac*(255-a);
		}
	}

	return output;
};

var applyFilters = function()
{
	// Still working on another task
	if (WORKING) {
		return;
	}

	WORKING = true;
	disableButtons(true);

	IMAGE_DATA = getOriginalyDisplayedImageData();
	applyFiltersToImageData();

	disableButtons(false);
	WORKING = false;
};

var applyFiltersToImageData = function()
{
	if (BRIGHTNESS !== BRIGHTNESS_DEFAULT) {
		IMAGE_DATA = updateBrightness(BRIGHTNESS);
	}

	if (CONTRAST !== CONTRAST_DEFAULT) {
		IMAGE_DATA = updateContrast(CONTRAST);
	}

	if (SATURATION !== SATURATION_DEFAULT) {
		IMAGE_DATA = updateSaturation(SATURATION);
	}

	if (SHARPNESS !== SHARPNESS_DEFAULT) {
		IMAGE_DATA = updateSharpness(IMAGE_DATA, SHARPNESS);
	}

	return IMAGE_DATA;
};

// Transform the image on the canvas by using a function.
// Note: this will apply the transform to the WHOLE canvas.
var transform = function(fn, factor)
{
	var oldpx = IMAGE_DATA.data;
	var newdata = CONTEXT.createImageData(IMAGE_DATA);
	var newpx = newdata.data;
	var res = [];
	var len = newpx.length;

	for (var i = 0; i < len; i += 4) {
		res = fn.call(this, oldpx[i], oldpx[i+1], oldpx[i+2], oldpx[i+3], factor, i);
		newpx[i]   = res[0]; // r
		newpx[i+1] = res[1]; // g
		newpx[i+2] = res[2]; // b
		newpx[i+3] = res[3]; // a
	}

	return newdata;
};

var setStep = function(step)
{
	var step1 = document.getElementsByClassName("step1");
	var step2 = document.getElementsByClassName("step2");

	var step1Display = "none";
	var step2Display = "block";

	var canvasWidth = document.body.clientWidth;
	var canvasHeight = window.innerHeight - HEADER_HEIGHT - TOP_BUTTONS_HEIGHT;

	if (step === 1) {
		step1Display = "block";
		step2Display = "none";
		canvasHeight -= CONTROLS_HEIGHT_STEP1;
	} else if (step === 2) {
		step1Display = "none";
		step2Display = "block";
		canvasHeight -= CONTROLS_HEIGHT_STEP2;
	}

	CANVAS.width = canvasWidth * PIXEL_RATIO;
	CANVAS.height = canvasHeight * PIXEL_RATIO;
	CANVAS.style.width = canvasWidth + "px";
	CANVAS.style.height = canvasHeight + "px";

	for (var i=0; i<step1.length; i++) {
		step1[i].style.display = step1Display;
	}

	for (var i=0; i<step2.length; i++) {
		var display = step2[i].getAttribute("step-2-display");

		step2[i].style.display = display ? display : step2Display;
	}
};

var disableButtons = function(toggle)
{
	var buttons = document.querySelectorAll(".button");

	for (var i=0; i<buttons.length; i++) {
		if (toggle === true) {
			buttons[i].setAttribute("disabled", "");
		} else {
			buttons[i].removeAttribute("disabled");
		}
	}
};

var printRgb = function(rgb, message)
{
	var color = rgbToHexCode(rgb);

	if (!message) {
		message = "";
	}

	console.log(message + "%c" + color + " (" + rgb.r + ',' + rgb.g + ',' + rgb.b + ')', "background: #white; color: " + color);
};

/**
 * Takes an RGB object and convert it to its hexadecimal color code.
 * Example: rgb(255,0,0) -> #ff0000
 */
var rgbToHexCode = function(pixel)
{
	var red = pixel.r.toString(16);
	var green = pixel.g.toString(16);
	var blue = pixel.b.toString(16);

	// Pas number: 0 -> 00
	red = red.padStart(2, '0');
	green = green.padStart(2, '0');
	blue = blue.padStart(2, '0');

	return '#' + red + green + blue;
};

/**
 * Calculate a value between 0 and 1 determining how light an RGB color is.
 *
 * https://www.rapidtables.com/convert/color/rgb-to-hsl.html
 */
var rgbLightness = function(rgb)
{
	if (!rgb) {
		return 0;
	}

	var r = rgb.r / 255;
	var g = rgb.g / 255;
	var b = rgb.b / 255;

	var cMax = Math.max(r, g, b);
	var cMin = Math.min(r, g, b);

	return (cMax + cMin) / 2;
};

var colorDistance = function(rgb1, rgb2)
{
	var dr = rgb1.r - rgb2.r;
	var dg = rgb1.g - rgb2.g;
	var db = rgb1.b - rgb2.b;

	return Math.sqrt(dr*dr + dg*dg + db*db);
};

var sliderValue = function(index, value)
{
	// Get value
	if (value === undefined) {
		return Number(INPUTS[index].value);
	}

	// Set value
	INPUTS[index].value = value;

	return Number(value);
};

var brightnessSlider = function(value)
{
	return sliderValue(0, value);
};

var contrastSlider = function(value)
{
	return sliderValue(1, value);
};

var saturationSlider = function(value)
{
	return sliderValue(2, value);
};

var sharpnessSlider = function(value)
{
	return sliderValue(3, value);
};

/**
 * Draw one pixel dot on the canvas.
 *
 * @param {*} x
 * @param {*} y
 */
var drawRectangle = function(x,y, width,height, r,g,b,a)
{
	CONTEXT.fillStyle = "rgba("+r+","+g+","+b+","+(a/255)+")";
	CONTEXT.fillRect(x, y, width, height);
};

var filterThreshold = function(imageData, threshold)
{
	var data = imageData.data;

	for (var i=0; i<data.length; i+=4) {
		var r = data[i];
		var g = data[i+1];
		var b = data[i+2];
		var v = (0.2126*r + 0.7152*g + 0.0722*b >= threshold) ? 255 : 0;
		data[i] = data[i+1] = data[i+2] = v;
	}

	return imageData;
};

/**
 * Sobel convolution filter, can be used to detect edges.
 * https://www.html5rocks.com/en/tutorials/canvas/imagefilters/
 *
 * Usage example:
 *     var imageData = CONTEXT.getImageData(picture.posX, picture.posY, picture.width, picture.height);
 *     var imageData = sobel(imageData);
 *     CONTEXT.putImageData(imageData, picture.posX, picture.posY);
 *
 * @param {*} imageData
 */
var sobel = function(imageData)
{
	var grayscale = updateGreyscale(imageData);
	var vertical = convolute(grayscale, [
		-1, 0, 1,
		-2, 0, 2,
		-1, 0, 1
	]);
	var horizontal = convolute(grayscale, [
		-1, -2, -1,
		 0,  0,  0,
		 1,  2,  1
	]);
	var finalImage = CONTEXT.createImageData(imageData.width, imageData.height);

	for (var i=0; i<finalImage.data.length; i+=4) {
		// Make the vertical gradient red
		var v = Math.abs(vertical.data[i]);
		finalImage.data[i] = v;

		// Make the horizontal gradient green
		var h = Math.abs(horizontal.data[i]);
		finalImage.data[i+1] = h;

		// Mix in some blue for aesthetics
		finalImage.data[i+2] = (v+h)/4;
		finalImage.data[i+3] = 255;
	}

	return finalImage;
};

/**
 * Turn a base64 image into a File object.
 *
 * @param string dataUrl: An image encoded into a base64 string
 *
 * @return {File}
 */
var dataUrlToFile = function(dataUrl)
{
	var byteString = atob(dataUrl.split(',')[1]);
	var mimeString = dataUrl.split(',')[0].split(':')[1].split(';')[0];

	var ab = new ArrayBuffer(byteString.length);
	var ia = new Uint8Array(ab);

	for (var i=0; i<byteString.length; i++) {
		ia[i] = byteString.charCodeAt(i);
	}

	return new Blob([ab], {type: mimeString});
};

/**
 * https://stackoverflow.com/questions/12168909/blob-from-dataurl
 *
 * @param {*} dataUrl
 */
var dataUrlToArrayBuffer = function(dataUrl)
{
	var byteString = atob(dataUrl.split(',')[1]);
	var arrayBuffer = new ArrayBuffer(byteString.length);
	var array = new Uint8Array(arrayBuffer);

	for (var i=0; i<byteString.length; i++) {
		array[i] = byteString.charCodeAt(i);
	}

	return arrayBuffer;
};

/**
 * Convert EXIF orientation value to  degrees.
 */
var orientationToDegress = function(orientation)
{
	switch (Number(orientation)) {
		case 1: return 0;
		case 2: return 0;
		case 3: return 180;
		case 4: return 180;
		case 5: return 90;
		case 6: return 90;
		case 7: return 270;
		case 8: return 270;
		default: return 0;
	}
};

/**
 *
 * Read orientation from EXIF data.
 * https://stackoverflow.com/questions/7584794/accessing-jpeg-exif-rotation-data-in-javascript-on-the-client-side
 *
 * @param {*} dataUrl
 */
var getOrientation = function(dataUrl)
{
	var view = new DataView(dataUrlToArrayBuffer(dataUrl));

	if (view.getUint16(0, false) != 0xFFD8) {
		return -2;
	}

	var length = view.byteLength;
	var offset = 2;

	while (offset < length) {
		if (view.getUint16(offset+2, false) <= 8) {
			return -1;
		}

		var marker = view.getUint16(offset, false);
		offset += 2;

		if (marker == 0xFFE1) {
			if (view.getUint32(offset += 2, false) != 0x45786966) {
				return -1;
			}

			var little = view.getUint16(offset += 6, false) == 0x4949;
			offset += view.getUint32(offset + 4, little);
			var tags = view.getUint16(offset, little);
			offset += 2;

			for (var i=0; i<tags; i++) {
				if (view.getUint16(offset + (i * 12), little) == 0x0112) {
					return view.getUint16(offset + (i * 12) + 8, little);
				}
			}
		} else if ((marker & 0xFF00) != 0xFF00) {
			break;
		} else {
			offset += view.getUint16(offset, false);
		}
	}

	return -1;
};

// Remove loading once the page is fully loaded
window.addEventListener("load", function () {
	LOADING.classList.remove("shown");
});
