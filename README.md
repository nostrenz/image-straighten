# Image-straighten

![Demo](https://raw.githubusercontent.com/nostrenz/image-straighten/master/demo.gif)

A simple web page to crop, straighten, and apply basic filters to an image.

## Usage

Clone this repository and open `index.html` in a web browser, then select an image using the file input at the top left of the page.

Move the green handles as needed then click the **Crop image** at the bottom. The cropped image will then be displayed and you'll be able to add some filters with the controls at the bottom. The image can also be rotated using the two arrow buttons at the top-left of the page.

After clicking the **Confirm crop** button the final edited image will be available as base64-encoded data-url in the closeAndEmitEditedImage() function.

## Dependencies:

* **OpenCV**:
[GitHub](https://github.com/opencv/opencv)

* **tracking.js** by _eduardolundgren_:
[GitHub](https://github.com/eduardolundgren/tracking.js)

Both of those dependencies consist of a single JS file, and for simplicity they're by default hot linked in the `index.html` file:

```html
<script src="https://trackingjs.com/bower/tracking.js/build/tracking-min.js"></script>
<script src="https://docs.opencv.org/4.5.5/opencv.js"></script>
```

For longer-term use it would be better to download those two files locally and update the `src` attributes with the local paths.

`opencv.js` can also be obtained from the [opencv-X.X.X-docs.zip](https://github.com/opencv/opencv/releases/download/4.5.5/opencv-4.5.5-docs.zip) archive available with each [OpenCV releases](https://github.com/opencv/opencv/releases).
