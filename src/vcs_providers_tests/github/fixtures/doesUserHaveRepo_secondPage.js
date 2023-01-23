const express = require("express");
const app = express();

let port, nodeID = [];

app.get("/repos/:owner/:repo/contributors", async (req, res) => {
  switch(parseInt(req.query.page, 10)) {
    case 2: // Only return the page the test wants
    // on the second page
      res
        .status(200)
        .set({
          Authorization: req.get("Authorization"),
          "User-Agent": req.get("User-Agent"),
          Link: `<localhost:${port}/user/repos?page=1>; rel="first", <localhost:${port}/user/urepos?page=2>, rel="self"`
        })
        .json([
          {
            node_id: nodeID[1],
            permissions: {
              admin: true
            },
            role_name: "admin"
          }
        ]);
      break;
    case 1:
    default:
      res
        .status(200)
        .set({
          Authorization: req.get("Authorization"),
          "User-Agent": req.get("User-Agent"),
          Link: `<localhost:${port}/user/repos?page=1>; rel="self", <localhost:${port}/user/repos?page=2>, rel="last"`
        })
        .json([
          {
            node_id: nodeID[0],
            permissions: {
              admin: true
            },
            role_name: "admin"
          }
        ]);
  }
});

function setNodeID(val) {
  nodeID = val;
}

function setPort(val) {
  port = val;
}

module.exports = {
  app,
  setNodeID,
  setPort,
};