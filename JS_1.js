<html>
    
    <head>
        <title>Let's hope this works</title>
    </head>
    <body>
        <p align = "center">
        <canvas id = "picasso"></canvas>
        </p>
    </body>
    <script src = "jquery.js"></script>
    <script src = "processing.js"></script>
    <script>
        var sketchProc = function(processingInstance){
            
            size(400,400);
            framerate(30);

            while(processingInstance){
                fill(255,0,0);
                ellipse(100,100,40,40);
            }
            var $canvas = $("#picasso");
            var processingInstance = new Processing(canvas,sketchProc);
        };
    </script>
</html>