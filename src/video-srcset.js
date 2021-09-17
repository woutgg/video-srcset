(function (window, undefined) {


	function videoSourceSet(options, elements) {

		options = Object.assign({}, {
			resize: false,
			resizeDelay: 50
		}, options);

		// If no specific elements recieved -> take all the video tags in the page
		if (elements === undefined) {
			elements = document.getElementsByTagName('video');
		}

		// Pattern of a src set element
		var regex = /^\s*(.+)\s+((\d+)[h]?|(\d+\/\d+)|(-))\s*$/;

		/**
		 * @param string def The srcset attribute value
		 * @returns Array<{src:string, width:number|undefined, ratio:number|undefined, isDefault:bool}>
		 * 		 List of source options - with their max width or ratio value, and a flag marking any defaults
		 */
		function getSourceSets(def) {
			var sources = [];
			var parts = def.split(',');

			for (var i in parts) {
				var result;
				if (result = parts[i].match(regex)) {
					sources.push({
						src: result[1],
						// condition: result[2],
						width: result[3] !== undefined ? parseInt(result[3]) : undefined,
						ratio: tryParseRatio(result[4]),
						isDefault: result[5] === '-',
					});
				} else {
					console.warn("invalid sourceset specification encountered: '" + parts[i] + "'");
				}
			}

			return sources;
		}

		/**
		 * @param string spec The ratio string to parse (formatted as 'x/y')
		 * @returns number|undefined
		 */
		function tryParseRatio(spec) {
			if (typeof spec === 'string' || spec instanceof String) {
				var parts = spec.split('/');

				if (parts.length >= 2) {
					var numerator = parseFloat(parts[0]);
					var denominator = parseFloat(parts[1]);
					return !isNaN(numerator) && !isNaN(denominator) ? numerator / denominator : undefined;
				}
			}

			return undefined;
		}

		/**
		 * @param string|undefined spec The sizes specification (format: 'WxH, WxH, ...')
		 * @returns Array<{width:number, height:number}>
		 */
		function parseMediaSizes(spec) {
			if (typeof spec === 'string' || spec instanceof String) {
				var sizes = [];
				var parts = spec.split(',');

				for (var i = 0; i < parts.length; i++) {
					var nums = parts[i].split('x');
					sizes.push({
						width: parseInt(nums[0]),
						height: parseInt(nums[1]),
					});
				}

				return sizes;
			}

			return [];
		}

		/**
		 * @param string srcsrt The definition of the srcset attribute
		 * @param string mediaSizes The definition of media sizes
		 * @param number screenWidth The width of the container to find matching src for
		 * @param number screenRatio The size ratio of the container to find matching src for
		 * @returns string The best matching video source
		 */
		function selectSource(srcsrt, mediaSizes, screenWidth, screenRatio) {
			var sources = getSourceSets(srcsrt);
			var hasSizes = false, hasRatios = false;
			var mediaSizeArr = parseMediaSizes(mediaSizes);
			var defaultSource = null;

			for (var i = 0; i < sources.length; i++) {
				hasSizes |= sources[i].width !== undefined;
				hasRatios |= sources[i].ratio !== undefined;

				if (sources[i].isDefault) defaultSource = sources[i];

				if (Array.isArray(mediaSizeArr) && mediaSizeArr.length > i) {
					sources[i].mediaWidth = mediaSizeArr[i].width;
					sources[i].mediaHeight = mediaSizeArr[i].height;
				}
			}

			if (hasSizes && hasRatios) {
				console.warn('sourceset definition with both sizes and ratios encountered, using sizes');
			}

			var source = null;

			if (hasSizes) source = selectSourceBySize(sources, screenWidth);
			else source = selectSourceByRatio(sources, screenRatio);

			return source !== null ? source : defaultSource;
		}

		// FIXME: this will never return null, hence a default will not be respected when using widths.
		function selectSourceBySize(sources, screenWidth) {
			var selectedDiff = null;
			var source = null;

			for (var i in sources) {
				var candidate = sources[i];
				var candidateDiff = candidate.width - screenWidth;

				// Think of 'diff' as 'surplus'
				if (source === null ||  // First One
						(selectedDiff < 0 && candidateDiff >= 0) || // Got smaller - and then larger
						(candidateDiff < 0 && candidateDiff > selectedDiff) ||
						(candidateDiff >= 0 && candidateDiff < selectedDiff ) // Got one that match better
				) {
					selectedDiff = candidateDiff;
					source = candidate;
				}
			}

			return source;
		}

		function selectSourceByRatio(sources, screenRatio) {
			var selectedDiff = null;
			var source = null;

			for (var i in sources) {
				var candidate = sources[i];
				var candidateDiff = candidate.ratio - screenRatio;

				// Think of 'diff' as 'surplus'
				if (((selectedDiff === null || selectedDiff < 0) && candidateDiff >= 0) || // Got smaller - and then larger
						(candidateDiff < 0 && candidateDiff > selectedDiff) ||
						(candidateDiff >= 0 && candidateDiff < selectedDiff ) // Got one that match better
				) {
					selectedDiff = candidateDiff;
					source = candidate;
				}
			}

			return source;
		}

		function init(elements) {
			// Select sources for valid elements from the requested ones
			for (var i = 0; i < elements.length; i++) {
				var element = elements[i];
				// If the element isn't a <video> tag with data-srcset="..." attribute - don't even check it
				if (element.tagName == 'VIDEO' && element.hasAttribute('data-srcset')) {
					var srcset = element.getAttribute('data-srcset');
					var sizes = element.getAttribute('data-sizes');

					// check if srcset is not empty
					if(srcset) {
						var ratio = window.innerWidth / window.innerHeight;
						var selectedSource = selectSource(srcset, sizes, window.innerWidth, ratio);
						// Don't reapply the same src (to prevent reloading of the same video if run in resize, etc...)
						if (selectedSource.src !== element.src) {
							element.src = selectedSource.src;
							if ('mediaWidth' in selectedSource) element.width = selectedSource.mediaWidth;
							if ('mediaHeight' in selectedSource) element.height = selectedSource.mediaHeight;
						}
					}
				}
			}
		}

		init(elements);

		if(options.resize) {
			var resizeDelayTimeout = null;
			window.addEventListener('resize', function() {
				if(resizeDelayTimeout!==null) {
					clearTimeout(resizeDelayTimeout);
				}
				resizeDelayTimeout = setTimeout(function() {
					init(elements);
				}, options.resizeDelay);
			});
		}

	}


	// Polyfill for Object.assign
	// Source: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/assign#Polyfill
	if (typeof Object.assign != 'function') {
		// Must be writable: true, enumerable: false, configurable: true
		Object.defineProperty(Object, "assign", {
			value: function assign(target, varArgs) { // .length of function is 2
				'use strict';
				if (target == null) { // TypeError if undefined or null
					throw new TypeError('Cannot convert undefined or null to object');
				}

				var to = Object(target);

				for (var index = 1; index < arguments.length; index++) {
					var nextSource = arguments[index];

					if (nextSource != null) { // Skip over if undefined or null
						for (var nextKey in nextSource) {
							// Avoid bugs when hasOwnProperty is shadowed
							if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
								to[nextKey] = nextSource[nextKey];
							}
						}
					}
				}
				return to;
			},
			writable: true,
			configurable: true
		});
	}


	if (typeof window.jQuery !== 'undefined') {
		(function ($) {
			$.fn.videoSrcset = function (options) {
				return new videoSourceSet(options || {}, $(this).filter('video[srcset]'));
			}
		})(window.jQuery);
	}

	if(typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
		module.exports = videoSourceSet;
	}

	window.videoSourceSet = videoSourceSet;

})(window);
