/*******************************************************************************
 * Copyright 2017, 2018 CNES - CENTRE NATIONAL d'ETUDES SPATIALES
 *
 * This file is part of MIZAR.
 *
 * MIZAR is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * MIZAR is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with MIZAR. If not, see <http://www.gnu.org/licenses/>.
 ******************************************************************************/
/***************************************
 * Copyright 2011, 2012 GlobWeb contributors.
 *
 * This file is part of GlobWeb.
 *
 * GlobWeb is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, version 3 of the License, or
 * (at your option) any later version.
 *
 * GlobWeb is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with GlobWeb. If not, see <http://www.gnu.org/licenses/>.
 ***************************************/

define(["./Program", "../Tiling/Tile"], function(Program, Tile) {
    //*************************************************************************

    /**
	@name GroundOverlayRenderer
	@class
	 GroundOverlayRenderer constructor
	@param {TileManager} tileManager Tile manager
	@constructor
	*/
    var GroundOverlayRenderer = function(tileManager) {
        this.enabled = true;

        this.renderContext = tileManager.renderContext;
        this.tileManager = tileManager;

        var vertexShader = "attribute vec3 vertex;\n";
        vertexShader += "attribute vec2 tcoord;\n";
        vertexShader += "uniform mat4 modelViewMatrix;\n";
        vertexShader += "uniform mat4 projectionMatrix;\n";
        vertexShader += "uniform vec4 extent; \n";
        vertexShader += "varying vec2 texCoord;\n";
        vertexShader += "void main(void) \n";
        vertexShader += "{\n";
        vertexShader +=
            "	gl_Position = projectionMatrix * modelViewMatrix * vec4(vertex, 1.0);\n";
        vertexShader +=
            "	texCoord.x = tcoord.x * (extent[1] - extent[0]) + extent[0];\n";
        vertexShader +=
            "	texCoord.y = tcoord.y * (extent[3] - extent[2]) + extent[2];\n";
        vertexShader += "}\n";

        var fragmentShader = "#ifdef GL_ES\n";
        fragmentShader += "precision highp float;\n";
        fragmentShader += "#endif\n";
        fragmentShader += "\n";
        fragmentShader += "varying vec2 texCoord;\n";
        fragmentShader += "uniform sampler2D overlayTexture;\n";
        fragmentShader += "uniform mat3 transform;\n";
        fragmentShader += "uniform float opacity; \n";
        fragmentShader += "\n";
        fragmentShader += "void main(void)\n";
        fragmentShader += "{\n";
        fragmentShader += "	vec3 tc = transform * vec3(texCoord,1.0); \n";
        fragmentShader += "	tc.xy /= tc.z; \n";
        fragmentShader +=
            "	gl_FragColor.rgba = texture2D(overlayTexture, tc.xy); \n";
        fragmentShader +=
            "	gl_FragColor.a = (tc.x >= 0.0 && tc.x <= 1.0 && tc.y >= 0.0 && tc.y <= 1.0) ? opacity * gl_FragColor.a  : 0.0; \n";
        fragmentShader += "}\n";

        this.program = new Program(this.renderContext);
        this.program.createFromSource(vertexShader, fragmentShader);

        this.groundOverlays = [];
    };

    //*************************************************************************

    /*
	Render the ground overlays above the tiles in parameter
 */
    GroundOverlayRenderer.prototype.render = function(tiles) {
        if (this.enabled === false) {
            // Disabled, so no rendering
            return;
        }

        var gl = this.renderContext.gl;

        // Setup program
        this.program.apply();

        var attributes = this.program.attributes;

        gl.uniformMatrix4fv(
            this.program.uniforms.projectionMatrix,
            false,
            this.renderContext.projectionMatrix
        );
        gl.uniform1i(this.program.uniforms.overlayTexture, 0);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthFunc(gl.LEQUAL);
        gl.depthMask(false);

        var modelViewMatrix = mat4.create();

        var currentIB = null;

        for (var j = 0; j < this.groundOverlays.length; j++) {
            var go = this.groundOverlays[j];

            // Image is not loaded, nothing to be done
            if (!go.image.complete) {
                continue;
            }

            if (!go.texture) {
                go.texture = this.renderContext.createNonPowerOfTwoTextureFromImage(
                    go.image,
                    go.flipY
                );
            }

            var initialized = false;

            for (var i = 0; i < tiles.length; i++) {
                var tile = tiles[i];
                if (go.geoBound.intersects(tile.geoBound)) {
                    if (!initialized) {
                        gl.uniformMatrix3fv(
                            this.program.uniforms.transform,
                            false,
                            go.inverseTransform
                        );
                        gl.uniform1f(
                            this.program.uniforms.opacity,
                            go.getOpacity()
                        );

                        gl.activeTexture(gl.TEXTURE0);
                        gl.bindTexture(gl.TEXTURE_2D, go.texture);

                        gl.bindBuffer(
                            gl.ARRAY_BUFFER,
                            this.tileManager.tcoordBuffer
                        );
                        gl.vertexAttribPointer(
                            attributes.tcoord,
                            2,
                            gl.FLOAT,
                            false,
                            0,
                            0
                        );

                        initialized = true;
                    }

                    var extent =
                        tile.state === Tile.State.LOADED
                            ? tile.bound
                            : tile.parent.bound;

                    gl.uniform4f(
                        this.program.uniforms.extent,
                        extent.west,
                        extent.east,
                        extent.north,
                        extent.south
                    );
                    mat4.multiply(
                        this.renderContext.viewMatrix,
                        tile.matrix,
                        modelViewMatrix
                    );
                    gl.uniformMatrix4fv(
                        this.program.uniforms.modelViewMatrix,
                        false,
                        modelViewMatrix
                    );

                    // Bind the vertex buffer
                    gl.bindBuffer(gl.ARRAY_BUFFER, tile.vertexBuffer);
                    gl.vertexAttribPointer(
                        attributes.vertex,
                        3,
                        gl.FLOAT,
                        false,
                        0,
                        0
                    );

                    // Bind the index buffer only if different (index buffer is shared between tiles)
                    var indexBuffer =
                        tile.state === Tile.State.LOADED
                            ? this.tileManager.tileIndexBuffer.getSolid()
                            : this.tileManager.tileIndexBuffer.getSubSolid(
                                tile.parentIndex
                            );
                    if (currentIB !== indexBuffer) {
                        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
                        currentIB = indexBuffer;
                    }

                    // Finally draw the tiles
                    gl.drawElements(
                        gl.TRIANGLES,
                        indexBuffer.numIndices,
                        gl.UNSIGNED_SHORT,
                        0
                    );
                }
            }
        }

        gl.disable(gl.BLEND);
        gl.depthMask(true);
    };

    //*************************************************************************

    return GroundOverlayRenderer;
});
